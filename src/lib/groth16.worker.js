export default (self) => {
  let instance;
  let memory;
  let i32;

  function alloc(length) {
      while (i32[0] & 3) i32[0]++;  // Return always aligned pointers
      const res = i32[0];
      i32[0] += length;
      while (i32[0] > memory.buffer.byteLength) {
          memory.grow(100);
      }
      i32 = new Uint32Array(memory.buffer);
      return res;
  }

  function putBin(b) {
      const p = alloc(b.byteLength);
      const s32 = new Uint32Array(b);
      i32.set(s32, p/4);
      return p;
  }

  function getBin(p, l) {
      return memory.buffer.slice(p, p+l);
  }

  self.addEventListener('message', e => {
    if(!e) return;
    let data;
    if (e.data) {
        data = e.data;
    } else {
        data = e;
    }

    // console.log("Worker get data", data);
    if (data.command === "INIT") {
        // console.log("==== init 1 ====")
        const code = new Uint8Array(data.code);
        try {
          memory = new WebAssembly.Memory({initial:data.init});
          i32 = new Uint32Array(memory.buffer);
    
          // console.log("==== init 2 ====")
          WebAssembly.compile(code).then((wasmModule)=>{
            WebAssembly.instantiate(wasmModule, {
              env: {
                "memory": memory
              }
            }).then((result)=>{
              instance = result;
              self.postMessage(data.result);
            })
          })
        } catch(err) {
          console.log("=== INIT Error ===", err.message);
          self.postMessage({ data: 999 })
        }
      } else if (data.command === "G1_MULTIEXP") {

        const oldAlloc = i32[0];
        const pScalars = putBin(data.scalars);
        const pPoints = putBin(data.points);
        const pRes = alloc(96);
        instance.exports.g1_zero(pRes);
        instance.exports.g1_multiexp2(pScalars, pPoints, data.n, 7, pRes);

        data.result = getBin(pRes, 96);
        i32[0] = oldAlloc;

        // console.log("Worker => boss", "G1_MULTIEXP");
        self.postMessage(data.result, [data.result]);
    } else if (data.command === "G2_MULTIEXP") {

        const oldAlloc = i32[0];
        const pScalars = putBin(data.scalars);
        const pPoints = putBin(data.points);
        const pRes = alloc(192);
        instance.exports.g2_zero(pRes);
        instance.exports.g2_multiexp(pScalars, pPoints, data.n, 7, pRes);

        data.result = getBin(pRes, 192);
        i32[0] = oldAlloc;
        // console.log("Worker => boss", "G2_MULTIEXP");
        self.postMessage(data.result, [data.result]);
    } else if (data.command === "CALC_H") {
        const oldAlloc = i32[0];
        const pSignals = putBin(data.signals);
        const pPolsA = putBin(data.polsA);
        const pPolsB = putBin(data.polsB);
        const nSignals = data.nSignals;
        const domainSize = data.domainSize;
        const pSignalsM = alloc(nSignals*32);
        const pPolA = alloc(domainSize*32);
        const pPolB = alloc(domainSize*32);
        const pPolA2 = alloc(domainSize*32*2);
        const pPolB2 = alloc(domainSize*32*2);

        instance.exports.fft_toMontgomeryN(pSignals, pSignalsM, nSignals);

        instance.exports.pol_zero(pPolA, domainSize);
        instance.exports.pol_zero(pPolB, domainSize);

        instance.exports.pol_constructLC(pPolsA, pSignalsM, nSignals, pPolA);
        instance.exports.pol_constructLC(pPolsB, pSignalsM, nSignals, pPolB);

        instance.exports.fft_copyNInterleaved(pPolA, pPolA2, domainSize);
        instance.exports.fft_copyNInterleaved(pPolB, pPolB2, domainSize);

        instance.exports.fft_ifft(pPolA, domainSize, 0);
        instance.exports.fft_ifft(pPolB, domainSize, 0);
        instance.exports.fft_fft(pPolA, domainSize, 1);
        instance.exports.fft_fft(pPolB, domainSize, 1);

        instance.exports.fft_copyNInterleaved(pPolA, pPolA2+32, domainSize);
        instance.exports.fft_copyNInterleaved(pPolB, pPolB2+32, domainSize);

        instance.exports.fft_mulN(pPolA2, pPolB2, domainSize*2, pPolA2);

        instance.exports.fft_ifft(pPolA2, domainSize*2, 0);

        instance.exports.fft_fromMontgomeryN(pPolA2+domainSize*32, pPolA2+domainSize*32, domainSize);

        data.result = getBin(pPolA2+domainSize*32, domainSize*32);
        i32[0] = oldAlloc;
        self.postMessage(data.result, [data.result]);
    } else if (data.command === "TERMINATE") {
        // console.log('进程终止')
        // process.exit(); // ######
    }
  });
}