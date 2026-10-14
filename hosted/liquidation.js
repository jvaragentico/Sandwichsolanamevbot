// Generic single-collateral USD model, not a lending-protocol adapter.
export function liquidationModel(input){
  const bounds={collateral:[0.01,1e9],debt:[0.01,1e9],threshold:[1,100],repay:[0.01,1e9],closeFactor:[1,100],bonus:[0,50],drop:[0,100],costs:[0,1e9],solPrice:[0.01,1e6]};
  const x={};for(const [key,[min,max]] of Object.entries(bounds)){
    if(input[key]===undefined||input[key]===''||typeof input[key]==='boolean')throw new Error(`Enter ${key}.`);
    const value=Number(input[key]);if(!Number.isFinite(value)||value<min||value>max)throw new Error(`${key} must be between ${min} and ${max}.`);x[key]=value;
  }
  const health=x.collateral*(x.threshold/100)/x.debt;
  const maximumRepay=Math.min(x.debt*x.closeFactor/100,x.collateral/(1+x.bonus/100));
  const eligible=health<1,withinLimit=x.repay<=maximumRepay;
  const collateralReceived=x.repay*(1+x.bonus/100),exitProceeds=collateralReceived*(1-x.drop/100);
  const pnl=exitProceeds-x.repay-x.costs,capital=x.repay+x.costs;
  return {source:'generic-synthetic-model',network:'none',inputs:x,health,maximumRepay,eligible,withinLimit,
    status:!eligible?'Not eligible under these assumptions':!withinLimit?'Repayment exceeds modeled limit':'Modeled liquidation eligible',
    capitalUsd:capital,capitalSolEquivalent:capital/x.solPrice,
    collateralReceivedUsd:eligible&&withinLimit?collateralReceived:null,exitProceedsUsd:eligible&&withinLimit?exitProceeds:null,
    estimatedPnlUsd:eligible&&withinLimit?pnl:null,
    limitations:'Approximate USD arithmetic. No live obligation, oracle, token liquidity, protocol fees or transaction simulation verified. SOL equivalent is a conversion, not a funding instruction.'};
}
