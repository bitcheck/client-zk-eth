export function compareAscSort(property){
  return function(a,b){
      var value1 = a[property];
      var value2 = b[property];
      return value1 - value2;
  }
}

//降序	  
export function compareDescSort(property){
  return function(a,b){
      var value1 = a[property];
      var value2 = b[property];
      return  value2 - value1;
  }
}