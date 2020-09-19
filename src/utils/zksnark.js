import {merkleTreeHeight} from "../config.js";
import merkleTree from "../lib/MerkleTree.js";
import buildGroth16 from "../lib/groth16_browser";
import snarkjs from 'snarkjs';
// const snarkjs = require('snarkjs')
// import circomlib from 'circomlib';
const circomlib = require('circomlib')
const circuit = require('../circuits/withdraw.json')
// import crypto from 'crypto';
const crypto = require('crypto')
// const merkleTree = require('../lib/MerkleTree')
// const buildGroth16 = require('websnark/src/groth16_browser');//将groth16改成groth16_browser.js，以适用于浏览器（非多线程）
// import websnarkUtils from websnark/src/utils;
const websnarkUtils = require('websnark/src/utils')
// import assert from 'assert';
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
  const noteRegex = /shaker-(?<currency>\w+)-(?<amount>[\d.]+)-(?<netId>\d+)-0x(?<note>[0-9a-fA-F]{124})/g
  const match = noteRegex.exec(noteString)
  if (!match) {
    throw new Error('The note has invalid format')
  }

  const buf = Buffer.from(match.groups.note, 'hex')
  const nullifier = bigInt.leBuff2int(buf.slice(0, 31))
  const secret = bigInt.leBuff2int(buf.slice(31, 62))
  const deposit = createDeposit({ nullifier, secret })
  const netId = Number(match.groups.netId)

  return { currency: match.groups.currency, amount: match.groups.amount, netId, deposit }
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
export async function generateProof({ deposit, recipient, relayerAddress = 0, fee = 0, refund = 0 }, shaker, proving_key) {
  // Compute merkle proof of our commitment
  const { root, path_elements, path_index } = await generateMerkleProof(deposit, shaker)
  // Prepare circuit input
  // 电路的配置模版见/circuits/withdraw.circom
  const input = {
    // Public snark inputs
    root: root,
    nullifierHash: deposit.nullifierHash,
    // commitment: deposit.commitmentHex, //######
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
  // console.time('Proof time')
  const groth16 = await buildGroth16();
  console.log("=====10=====")
  const proofData = await websnarkUtils.genWitnessAndProve(groth16, input, circuit, proving_key)
  const { proof } = websnarkUtils.toSolidityInput(proofData)
  // console.timeEnd('Proof time')

  const args = [
    toHex(input.root),
    toHex(input.nullifierHash),
    toHex(input.recipient, 20),
    toHex(input.relayer, 20),
    toHex(input.fee),
    toHex(input.refund), //通过查找deposit时的金额发送，这个参数暂时不用，但是仍旧参与零知识证明计算，并传给合约
    toHex(deposit.commitmentHex) //通过commitment在合约中找到原来保存时的金额与收款人
  ]
  return { proof, args }
}

/**
 * Generate merkle tree for a deposit.
 * Download deposit events from the shaker, reconstructs merkle tree, finds our deposit leaf
 * in it and generates merkle proof
 * @param deposit Deposit object
 */
async function generateMerkleProof(deposit, shaker) {
  // Get all deposit events from smart contract and assemble merkle tree from them
  console.log('Getting current state from shaker contract')
  const events = await shaker.getPastEvents('Deposit', { fromBlock: 0, toBlock: 'latest' })
  // 获取第一个分片
  const leaves = events
    .sort((a, b) => a.returnValues.leafIndex - b.returnValues.leafIndex) // Sort events in chronological order
    .map(e => e.returnValues.commitment)
  // console.log("leaves: ", leaves);
  const tree = new merkleTree(merkleTreeHeight, leaves)

  // Find current commitment in the tree
  const depositEvent = events.find(e => e.returnValues.commitment === deposit.commitmentHex)
  const leafIndex = depositEvent ? depositEvent.returnValues.leafIndex : -1

  // Validate that our data is correct
  const root = await tree.root()
  const isValidRoot = await shaker.methods.isKnownRoot(toHex(root)).call()
  const isSpent = await shaker.methods.isSpent(deposit.nullifierHex).call()
  assert(isValidRoot === true, 'Merkle tree is corrupted')
  assert(isSpent === false, 'The note is already spent')
  assert(leafIndex >= 0, 'The deposit is not found in the tree')

  // Compute merkle proof of our commitment
  return tree.path(leafIndex)
}