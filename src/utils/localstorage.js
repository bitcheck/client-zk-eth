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
    const notes = localStorage.key(i);
    const noteKey = notes.split('_');
    if(noteKey[0] === account && noteKey[1] === "note") {
      // filter the account
      values.push(localStorage[notes]);
      keys.push(notes);
    }
  }
  return [keys, values];
}

export const eraseNoteString = (key) => {
  localStorage.removeItem(key);
}