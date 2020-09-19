//动态规划 -- 硬币找零问题
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

const coins = [100, 300, 800, 3000, 4000, 8000, 30000, 130000, 300000, 400000]; //找零的钱币面值
// var total = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 120000, 200000, 500000]; //找零金额
// var n = coins.length

// console.log("金额", "切片数", "GAS费费用率");
// for(var i = 0; i < total.length; i++) {
// 	var combination = minCoins(coins,total[i],n);
// 	console.log(total[i], combination.length, (combination.length * 0.2 * 400 / total[i] * 100).toFixed(2) + "%", combination);
// 	//200GWei的gas价格以及400U市场几个估计
// }

export const getCombination = (amount) => {
  return minCoins(coins, amount, coins.length);
}