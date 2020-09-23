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

export const saveNoteString = (account, noteString, type = 0) => {
  const keyword = type === 0 ? "note" : "recv";
  let has = false;
  for(let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    const acc = key.split("_")[0];
    const t = key.split("_")[1];
    if(localStorage[key] === noteString && acc === account && keyword === t) {
      has = true;
      break;
    }
  }
  console.log(noteString, has);
  if(!has) {
    const key = account + "_" + keyword + "_" + getRandomCode(32);
    localStorage[key] = noteString;
    return key;  
  } else return 0;
}

export const getNoteStrings = (account, type) => {
  var keys = [];
  var values = [];
  for(let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if(type === 0) {
      if(checkNoteKeyFormat(key, account, "note")) {
        values.push(localStorage[key]);
        keys.push(key);
      }
    } else {
      if(checkNoteKeyFormat(key, account, "recv")) {
        values.push(localStorage[key]);
        keys.push(key);
      }
    }
  }
  return [keys, values];
}
const checkNoteKeyFormat = (note, account, keyword) => {
  const noteKey = note.split('_');
  if(noteKey[0] === account && noteKey[1] === keyword) return true;
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
