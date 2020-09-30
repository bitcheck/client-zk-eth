import worker from './groth16.worker.js';
import WebWorker from './WebWorker';

/* globals WebAssembly, navigator, Promise, window */
const bigInt = require("big-integer");
const groth16_wasm = require("websnark/build/groth16_wasm");
const assert = require("assert");

class Deferred {
    constructor() {
        this.promise = new Promise((resolve, reject)=> {
            this.reject = reject;
            this.resolve = resolve;
        });
    }
}

/*
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
*/

// We use the Object.assign approach for the backwards compatibility
// @params Number wasmInitialMemory 
async function build(params) {
    const defaultParams = { wasmInitialMemory: 1000 };
    Object.assign(defaultParams, params);
    const groth16 = new Groth16();

    groth16.q = bigInt("21888242871839275222246405745257275088696311157297823662689037894645226208583");
    groth16.r = bigInt("21888242871839275222246405745257275088548364400416034343698204186575808495617");
    groth16.n64 = Math.floor((groth16.q.minus(1).bitLength() - 1)/64) +1;
    groth16.n32 = groth16.n64*2;
    groth16.n8 = groth16.n64*8;

    try {
      groth16.memory = new WebAssembly.Memory({initial:defaultParams.wasmInitialMemory});
    } catch (err) {
      console.log(err.message);
      return;
    }
    groth16.i32 = new Uint32Array(groth16.memory.buffer);

    const wasmModule = await WebAssembly.compile(groth16_wasm.code);

    groth16.instance = await WebAssembly.instantiate(wasmModule, {
        env: {
            "memory": groth16.memory
        }
    });
    
    groth16.pq = groth16_wasm.pq;
    groth16.pr = groth16_wasm.pr;

    groth16.pr0 = groth16.alloc(192);
    groth16.pr1 = groth16.alloc(192);

    groth16.workers = [];
    groth16.pendingDeferreds = [];
    groth16.working = [];

    let concurrency; //进程数

    if ((typeof(navigator) === "object") && navigator.hardwareConcurrency) {
        concurrency = navigator.hardwareConcurrency;
    } else {
        concurrency = 8;
    }

    // console.log('concurrency', concurrency);
    function getOnMsg(i) {
      return function(e) {
        let data;
        if ((e)&&(e.data)) {
            data = e.data;
        } else {
            data = e;
        }
        if(data.data === 999)  {
          groth16.pendingDeferreds[i].reject("Worker " + i + " is out of memory")
        }
        groth16.working[i]=false;
        groth16.pendingDeferreds[i].resolve(data);
        groth16.processWorks();
      };
    }

    for (let i = 0; i < concurrency; i++) {
        groth16.workers[i] = new WebWorker(worker);
        groth16.workers[i].addEventListener('message', getOnMsg(i));
        groth16.working[i] = false;
    }

    const initPromises = [];
    
    for (let i = 0; i < groth16.workers.length; i++) {
        const copyCode = groth16_wasm.code.buffer.slice(0);
        const action = groth16.postAction(i, {
            command: "INIT",
            init: defaultParams.wasmInitialMemory,
            code: copyCode
        }, [copyCode]);
        initPromises.push(action);
    }
    await Promise.all(initPromises);
    groth16.terminate();
    // groth16.memory = null; // ######
    return groth16;
}

class Groth16 {
    constructor() {
        this.actionQueue = [];
    }

    postAction(workerId, e, transfers, _deferred) {
        assert(this.working[workerId] === false); //过滤掉已经在工作的Worker
        this.working[workerId] = true; //设置当前Worker为工作中
        this.pendingDeferreds[workerId] = _deferred ? _deferred : new Deferred();
        this.workers[workerId].postMessage(e, transfers); //向worker发送消息
        return this.pendingDeferreds[workerId].promise;
    }

    processWorks() {
        for (let i=0; (i<this.workers.length)&&(this.actionQueue.length > 0); i++) {
            if (this.working[i] === false) {
                const work = this.actionQueue.shift();
                this.postAction(i, work.data, work.transfers, work.deferred);
            }
        }
    }

    queueAction(actionData, transfers) {
        const d = new Deferred();
        this.actionQueue.push({
            data: actionData,
            transfers: transfers,
            deferred: d
        });
        this.processWorks();
        return d.promise;
    }

    alloc(length) {
        while (this.i32[0] & 3) this.i32[0]++;  // Return always aligned pointers
        const res = this.i32[0];
        this.i32[0] += length;
        return res;
    }


    putBin(p, b) {
        const s32 = new Uint32Array(b);
        this.i32.set(s32, p/4);
    }

    getBin(p, l) {
        return this.memory.buffer.slice(p, p+l);
    }

    bin2int(b) {
        const i32 = new Uint32Array(b);
        let acc = bigInt(i32[7]);
        for (let i=6; i>=0; i--) {
            acc = acc.shiftLeft(32);
            acc = acc.add(i32[i]);
        }
        return acc.toString();
    }

    bin2g1(b) {
        return [
            this.bin2int(b.slice(0,32)),
            this.bin2int(b.slice(32,64)),
            this.bin2int(b.slice(64,96)),
        ];
    }
    bin2g2(b) {
        return [
            [
                this.bin2int(b.slice(0,32)),
                this.bin2int(b.slice(32,64))
            ],
            [
                this.bin2int(b.slice(64,96)),
                this.bin2int(b.slice(96,128))
            ],
            [
                this.bin2int(b.slice(128,160)),
                this.bin2int(b.slice(160,192))
            ],
        ];
    }

    async g1_multiexp(scalars, points) {
        const nPoints = scalars.byteLength /32;
        const nPointsPerThread = Math.floor(nPoints / this.workers.length);
        const opPromises = [];
        for (let i=0; i<this.workers.length; i++) {
            const th_nPoints =
                i < this.workers.length -1 ?
                    nPointsPerThread :
                    nPoints - (nPointsPerThread * (this.workers.length -1));
            const scalars_th = scalars.slice(i*nPointsPerThread*32, i*nPointsPerThread*32 + th_nPoints*32);
            const points_th = points.slice(i*nPointsPerThread*64, i*nPointsPerThread*64 + th_nPoints*64);
            opPromises.push(
                this.queueAction({
                    command: "G1_MULTIEXP",
                    scalars: scalars_th,
                    points: points_th,
                    n: th_nPoints
                }, [scalars_th, points_th])
            );
        }

        const results = await Promise.all(opPromises);

        this.instance.exports.g1_zero(this.pr0);
        for (let i=0; i<results.length; i++) {
            this.putBin(this.pr1, results[i]);
            this.instance.exports.g1_add(this.pr0, this.pr1, this.pr0);
        }

        return this.getBin(this.pr0, 96);
    }

    async g2_multiexp(scalars, points) {
        const nPoints = scalars.byteLength /32;
        const nPointsPerThread = Math.floor(nPoints / this.workers.length);
        const opPromises = [];
        for (let i=0; i<this.workers.length; i++) {
            const th_nPoints =
                i < this.workers.length -1 ?
                    nPointsPerThread :
                    nPoints - (nPointsPerThread * (this.workers.length -1));
            const scalars_th = scalars.slice(i*nPointsPerThread*32, i*nPointsPerThread*32 + th_nPoints*32);
            const points_th = points.slice(i*nPointsPerThread*128, i*nPointsPerThread*128 + th_nPoints*128);
            opPromises.push(
                this.queueAction({
                    command: "G2_MULTIEXP",
                    scalars: scalars_th,
                    points: points_th,
                    n: th_nPoints
                }, [scalars_th, points_th])
            );
        }

        const results = await Promise.all(opPromises);

        this.instance.exports.g2_zero(this.pr0);
        for (let i=0; i<results.length; i++) {
            this.putBin(this.pr1, results[i]);
            this.instance.exports.g2_add(this.pr0, this.pr1, this.pr0);
        }

        return this.getBin(this.pr0, 192);
    }

    g1_affine(p) {
        this.putBin(this.pr0, p);
        this.instance.exports.g1_affine(this.pr0, this.pr0);
        return this.getBin(this.pr0, 96);
    }

    g2_affine(p) {
        this.putBin(this.pr0, p);
        this.instance.exports.g2_affine(this.pr0, this.pr0);
        return this.getBin(this.pr0, 192);
    }

    g1_fromMontgomery(p) {
        this.putBin(this.pr0, p);
        this.instance.exports.g1_fromMontgomery(this.pr0, this.pr0);
        return this.getBin(this.pr0, 96);
    }

    g2_fromMontgomery(p) {
        this.putBin(this.pr0, p);
        this.instance.exports.g2_fromMontgomery(this.pr0, this.pr0);
        return this.getBin(this.pr0, 192);
    }

    loadPoint1(b) {
        const p = this.alloc(96);
        this.putBin(p, b);
        this.instance.exports.f1m_one(p+64);
        return p;
    }

    loadPoint2(b) {
        const p = this.alloc(192);
        this.putBin(p, b);
        this.instance.exports.f2m_one(p+128);
        return p;
    }

    terminate() {
        for (let i=0; i<this.workers.length; i++) {
            this.workers[i].postMessage({command: "TERMINATE"});//向worker发送消息
        }
    }


    async calcH(signals, polsA, polsB, nSignals, domainSize) {
        return this.queueAction({
            command: "CALC_H",
            signals: signals,
            polsA: polsA,
            polsB: polsB,
            nSignals: nSignals,
            domainSize: domainSize
        }, [signals, polsA, polsB]);
    }

    async proof(signals, pkey) {
        const pkey32 = new Uint32Array(pkey);
        const nSignals = pkey32[0];
        const nPublic = pkey32[1];
        const domainSize = pkey32[2];
        const pPolsA = pkey32[3];
        const pPolsB = pkey32[4];
        const pPointsA = pkey32[5];
        const pPointsB1 = pkey32[6];
        const pPointsB2 = pkey32[7];
        const pPointsC = pkey32[8];
        const pHExps = pkey32[9];
        const polsA = pkey.slice(pPolsA, pPolsA + pPolsB);
        const polsB = pkey.slice(pPolsB, pPolsB + pPointsA);
        const pointsA = pkey.slice(pPointsA, pPointsA + nSignals*64);
        const pointsB1 = pkey.slice(pPointsB1, pPointsB1 + nSignals*64);
        const pointsB2 = pkey.slice(pPointsB2, pPointsB2 + nSignals*128);
        const pointsC = pkey.slice(pPointsC, pPointsC + (nSignals-nPublic-1)*64);
        const pointsHExps = pkey.slice(pHExps, pHExps + domainSize*64);

        const alfa1 = pkey.slice(10*4, 10*4 + 64);
        const beta1 = pkey.slice(10*4 + 64, 10*4 + 128);
        const delta1 = pkey.slice(10*4 + 128, 10*4 + 192);
        const beta2 = pkey.slice(10*4 + 192, 10*4 + 320);
        const delta2 = pkey.slice(10*4 + 320, 10*4 + 448);


        const pH = this.calcH(signals.slice(0), polsA, polsB, nSignals, domainSize).then( (h) => {
            return this.g1_multiexp(h, pointsHExps);
        });

        const pA = this.g1_multiexp(signals.slice(0), pointsA);
        const pB1 = this.g1_multiexp(signals.slice(0), pointsB1);
        const pB2 = this.g2_multiexp(signals.slice(0), pointsB2);
        const pC = this.g1_multiexp(signals.slice((nPublic+1)*32), pointsC);

        const res = await Promise.all([pA, pB1, pB2, pC, pH]);

        const pi_a = this.alloc(96);
        const pi_b = this.alloc(192);
        const pi_c = this.alloc(96);
        const pib1 = this.alloc(96);


        this.putBin(pi_a, res[0]);
        this.putBin(pib1, res[1]);
        this.putBin(pi_b, res[2]);
        this.putBin(pi_c, res[3]);

        const pAlfa1 = this.loadPoint1(alfa1);
        const pBeta1 = this.loadPoint1(beta1);
        const pDelta1 = this.loadPoint1(delta1);
        const pBeta2 = this.loadPoint2(beta2);
        const pDelta2 = this.loadPoint2(delta2);


        let rnd = new Uint32Array(8);

        const aux1 = this.alloc(96);
        const aux2 = this.alloc(192);

        const pr = this.alloc(32);
        const ps = this.alloc(32);

        window.crypto.getRandomValues(rnd);
        this.putBin(pr, rnd);

        window.crypto.getRandomValues(rnd);
        this.putBin(ps, rnd);

        // pi_a = pi_a + Alfa1 + r*Delta1
        this.instance.exports.g1_add(pAlfa1, pi_a, pi_a);
        this.instance.exports.g1_timesScalar(pDelta1, pr, 32, aux1);
        this.instance.exports.g1_add(aux1, pi_a, pi_a);

        // pi_b = pi_b + Beta2 + s*Delta2
        this.instance.exports.g2_add(pBeta2, pi_b, pi_b);
        this.instance.exports.g2_timesScalar(pDelta2, ps, 32, aux2);
        this.instance.exports.g2_add(aux2, pi_b, pi_b);

        // pib1 = pib1 + Beta1 + s*Delta1
        this.instance.exports.g1_add(pBeta1, pib1, pib1);
        this.instance.exports.g1_timesScalar(pDelta1, ps, 32, aux1);
        this.instance.exports.g1_add(aux1, pib1, pib1);


        // pi_c = pi_c + pH
        this.putBin(aux1, res[4]);
        this.instance.exports.g1_add(aux1, pi_c, pi_c);


        // pi_c = pi_c + s*pi_a
        this.instance.exports.g1_timesScalar(pi_a, ps, 32, aux1);
        this.instance.exports.g1_add(aux1, pi_c, pi_c);

        // pi_c = pi_c + r*pib1
        this.instance.exports.g1_timesScalar(pib1, pr, 32, aux1);
        this.instance.exports.g1_add(aux1, pi_c, pi_c);

        // pi_c = pi_c - r*s*delta1
        const prs = this.alloc(64);
        this.instance.exports.int_mul(pr, ps, prs);
        this.instance.exports.g1_timesScalar(pDelta1, prs, 64, aux1);
        this.instance.exports.g1_neg(aux1, aux1);
        this.instance.exports.g1_add(aux1, pi_c, pi_c);

        this.instance.exports.g1_affine(pi_a, pi_a);
        this.instance.exports.g2_affine(pi_b, pi_b);
        this.instance.exports.g1_affine(pi_c, pi_c);

        this.instance.exports.g1_fromMontgomery(pi_a, pi_a);
        this.instance.exports.g2_fromMontgomery(pi_b, pi_b);
        this.instance.exports.g1_fromMontgomery(pi_c, pi_c);

        return {
            pi_a: this.bin2g1(this.getBin(pi_a, 96)),
            pi_b: this.bin2g2(this.getBin(pi_b, 192)),
            pi_c: this.bin2g1(this.getBin(pi_c, 96)),
        };
    }
}

// module.exports = build;
export default build;