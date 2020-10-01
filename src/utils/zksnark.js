import {merkleTreeHeight, erc20ShakerVersion} from "../config.js";
import merkleTree from "../lib/MerkleTree.js";
import buildGroth16 from "../lib/groth16_browser";
import snarkjs from 'snarkjs';
import {myEvent} from './event.js';
const circomlib = require('circomlib')
const circuit = require('../circuits/withdraw.json')
const crypto = require('crypto')
const websnarkUtils = require('websnark/src/utils')
// const websnarkUtils = require('../lib/websnarkUtils.js')
const assert = require('assert')

const bigInt = snarkjs.bigInt

/** Compute pedersen hash */
export const pedersenHash = data => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]

/** BigNumber to hex string of specified length */
export function toHex(number, length = 32) {
  const str = number instanceof Buffer ? number.toString('hex') : bigInt(number).toString(16)
  return '0x' + str.padStart(length * 2, '0')
}

/** Generate random number of specified byte length */
export const rbigint = nbytes => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))


/**
 * Parses Shaker.cash note
 * @param noteString the note
 */
export function parseNote(noteString) {
  // const noteRegex = /shaker-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g
  const noteRegex = /(?<logo>\w+)-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g
  const match = noteRegex.exec(noteString)
  if (!match) {
    throw new Error('The note has invalid format')
  }

  const buf = Buffer.from(match.groups.note, 'hex')
  const nullifier = bigInt.leBuff2int(buf.slice(0, 31))
  const secret = bigInt.leBuff2int(buf.slice(31, 62))
  const deposit = createDeposit({ nullifier, secret })
  const netId = Number(match.groups.netId)

  return { logo: match.groups.logo, currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
}

/**
 * Create deposit object from secret and nullifier
 */
export function createDeposit({ nullifier, secret }) {
  const deposit = { nullifier, secret }
  deposit.preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
  deposit.commitment = pedersenHash(deposit.preimage)
  deposit.commitmentHex = toHex(deposit.commitment)
  deposit.nullifierHash = pedersenHash(deposit.nullifier.leInt2Buff(31))
  deposit.nullifierHex = toHex(deposit.nullifierHash)
  return deposit
}

/**
 * Generate SNARK proof for withdrawal
 * @param deposit Deposit object
 * @param recipient Funds recipient
 * @param relayer Relayer address
 * @param fee Relayer fee
 * @param refund Receive ether for exchanged tokens
 */
export async function generateProof({ deposit, recipient, relayerAddress = 0, fee = 0, refund = 0 }, shaker, proving_key, account) {
  // Compute merkle proof of our commitment
  let merkleProof;
  if(erc20ShakerVersion === 'V1') {
    merkleProof = await generateMerkleProof(deposit, shaker, account)
  } else {
    const tree = new merkleTree(20, [])
    merkleProof = await tree.path(0)
  }
  const root = merkleProof.root
  const path_elements = merkleProof.path_elements
  const path_index = merkleProof.path_index

  // Prepare circuit input
  // 电路的配置模版见/circuits/withdraw.circom
  const input = {
    // Public snark inputs
    root: root,
    nullifierHash: deposit.nullifierHash,
    recipient: bigInt(recipient),
    relayer: bigInt(relayerAddress),
    fee: bigInt(fee),
    refund: bigInt(refund),

    // Private snark inputs
    nullifier: deposit.nullifier,
    secret: deposit.secret,
    pathElements: path_elements,
    pathIndices: path_index,
  }

  console.log('Generating SNARK proof')
  let proof;
  try {
    console.time('Proof time')
    myEvent.emit('GENERATE_PROOF', {message: 'Building Groth16...'})
    const groth16 = await buildGroth16();
    myEvent.emit('GENERATE_PROOF', {message: 'Generate Witness & Proving...'});


    // const witnessData = websnarkUtils.genWitness(input, circuit);
    // myEvent.emit('GENERATE_PROOF', {message: 'Convert Witness...'});
    // const witnessBin = websnarkUtils.convertWitness(witnessData.witness);
    // myEvent.emit('GENERATE_PROOF', {message: 'Generate Proving...'});
    // const proofData = await groth16.proof(witnessBin, proving_key);
    // myEvent.emit('GENERATE_PROOF', {message: 'Changing Signals...'})
    // proofData.publicSignals = websnarkUtils.stringifyBigInts2(witnessData.publicSignals);
    const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)


    proof = websnarkUtils.toSolidityInput(proofData).proof;
    myEvent.emit('GENERATE_PROOF', {step: 'done', message: 'Start signing...'});
    console.timeEnd('Proof time')  
  } catch (err) {
    return { proof: false, args: false };
  }

  const args = [
    toHex(input.root),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund), //通过查找deposit时的金额发送，这个参数暂时不用，但是仍旧参与零知识证明计算，并传给合约
  ]
  return { proof, args }
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the shaker, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */
async function generateMerkleProof(deposit, shaker, account) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  console.log('Getting current state from shaker contract')
  const events = await shaker.getPastEvents('Deposit', { fromBlock: 0, toBlock: 'latest' })
  // 获取第一个分片
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  const tree = new merkleTree(merkleTreeHeight, leaves)

  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === deposit.commitmentHex)
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1

  // Validate that our data is correct
  const root = await tree.root()
  const isValidRoot = await shaker.methods.isKnownRoot(toHex(root)).call({ from: account, gas: 1e6});
  const isSpent = await shaker.methods.isSpent(deposit.nullifierHex).call({ from: account, gas: 1e6});
  assert(isValidRoot === true, 'Merkle tree is corrupted')
  assert(isSpent === false, 'The note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')

  // Compute merkle proof of our commitment
  return tree.path(leafIndex)
}