//动态规划 -- 硬币找零问题
import {coins} from '../config.js';

function minCoins(coins,total,n){
	var T = [];
 
	for(let i = 0;i<n;i++){
		T[i] = []
		for (let j=0;j<= total;j++){
			if(j === 0){
				T[i][j] = 0;
				continue;
			}
 
			if(i === 0){
				T[i][j] = j/coins[i];
			}else{
				if(j >= coins[i]){
					T[i][j] = Math.min(T[i-1][j],1+T[i][j-coins[i]])
			
				}else{
					T[i][j] = T[i-1][j];
				}
			}
		}
	}
	return findValue(coins,total,n,T);
}
 
function findValue(coins,total,n,T){
	var i = n-1, j = total;
	while(i>0 && j >0){
		if(T[i][j] !== T[i-1][j]){
			break
		}else{
			i--;
		}
	}
 
	var s = []; //存储组合结果
	while(i >= 0 && j > 0 ){
		s.push(coins[i]);
		j=j-coins[i];
		if(j <= 0){
			break; //计算结束，退出循环
		}
		if(i>0){
			while(T[i][j] === T[i-1][j]){
				i--;
				if(i === 0){
					break;
				}
			}
		}
	}
	return s;
}

export const getCombination = (amount) => {
  return minCoins(coins, amount, coins.length);
}