function getRandomCode(length) {
  if (length > 0) {
     var data = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z", "a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q", "r", "s", "t", "u", "v", "w", "x", "y", "z"];
     var nums = "";
     for (var i = 0; i < length; i++) {
        var r = parseInt(Math.random() * 61);
        nums += data[r];
     }
     return nums;
  } else {
     return false;
  }
}

export const saveNoteString = (account, noteString) => {
  const key = account + "_note_" + getRandomCode(32);
  localStorage[key] = noteString;
  return key;
}

export const getNoteStrings = (account) => {
  var keys = [];
  var values = [];
  for(let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if(checkNoteKeyFormat(key, account)) {
      values.push(localStorage[key]);
      keys.push(key);
    }
  }
  return [keys, values];
}

const checkNoteKeyFormat = (note, account) => {
  const noteKey = note.split('_');
  if(noteKey[0] === account && noteKey[1] === "note") return true;
  else return false;
}
const checkNoteFormat = (note) => {
  const noteParts = note.split('-');
  if(noteParts.length === 5 && noteParts[0] === 'shaker') return true;
  else return false;
}
export const eraseNoteString = (key) => {
  localStorage.removeItem(key);
}

export const batchSaveNotes = (notes, account) => {
  const notesArray = notes.split(',');
  let waitToStore = [];
  // console.log("====", notesArray)
  for(let i = 0; i < notesArray.length; i++) {
    // console.log("====", notesArray[i]);
    const key = notesArray[i].split(':')[0];
    const note = notesArray[i].split(':')[1];
    if(checkNoteFormat(note) && key.split('_')[0] === account) {
      // 检测是否与现有note冲突，且账号相符
      // console.log("----", notesArray[i]);
      let has = false;
      for(let j = 0; j < localStorage.length; j++) {
        const key = localStorage.key(j);
        if(localStorage[key] === note) {
          has = true;
          break;
        }
      }
      if(!has) {
        waitToStore.push({key, note});
        has = false;
      }
    }
  }
  for(let i = 0; i < waitToStore.length; i++) {
    localStorage[waitToStore[i].key] = waitToStore[i].note;
  }
  return waitToStore.length;
}

// 0x3444E23231619b361c8350F4C83F82BCfAB36F65_note_QeNLqPB9m7OWmadWFdkL3RroXeAZJcN2:shaker-usdt-4000-4-0xb916961806025caa8eab3994faa055761b91ea797a7b33ead86bff467fdd54b0c333ce65a3a9644b27c8a67ac16fcd130b065636d6f88be295ec8ef43284,0x3444E23231619b361c8350F4C83F82BCfAB36F65_note_ORktwtwFDxIkW3pUC3ZR3WMQGEbnimi4:shaker-usdt-3000-4-0x4345a5d4301ed0bdf469824dff543031925fe66ff4508f9aa4ef3930181fef12605a612cd943df57ab1bee4d85a51c805d2834875ccfe53e00f669f1df87