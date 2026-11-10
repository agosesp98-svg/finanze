const assert=require('node:assert/strict');
const E=require('../engine.js');
const now=new Date(2026,9,26,12,0,0);
const settings=[{key:'salaryNet',value:1500},{key:'salaryDay',value:10},{key:'primaryAccountId',value:1}];
const cents=(actual,expected,message)=>assert.ok(Math.abs(actual-expected)<0.005,message||`${actual} ≠ ${expected}`);

async function main(){
  {
    const m=E.calculate({
      accounts:[{id:1,balance:100,protected:false},{id:2,balance:500,protected:false}],
      budgets:[{id:1,budget:200,spent:0}],
      commitments:[{id:1,name:'Addebito',amount:150,dueDate:'2026-11-01',active:true,accountId:1}],
      liabilities:[],goals:[],settings
    },now);
    assert.equal(m.overallShortfall,0);
    assert.equal(m.primaryShortfall,50);
    assert.equal(m.fundingShortfall,50);
    assert.equal(m.spendable,0);
  }

  {
    const m=E.calculate({
      accounts:[{id:1,name:'Conto addebiti',balance:24,protected:false},{id:2,name:'Altro conto',balance:34,protected:false}],
      budgets:[{id:1,budget:200,spent:0}],
      commitments:[{id:1,name:'Prossime uscite',amount:60,dueDate:'2026-11-01',active:true}],
      liabilities:[],goals:[],settings
    },now);
    assert.equal(m.ordinary,58);
    assert.equal(m.due,60);
    assert.equal(m.overallShortfall,2,'la liquidita aggregata da sola vedrebbe solo 2 euro mancanti');
    assert.equal(m.primaryDue,60,'le uscite senza conto esplicito devono gravare sul conto principale');
    assert.equal(m.primaryShortfall,36);
    assert.equal(m.fundingShortfall,36,'il fabbisogno reale deve rispettare il conto da cui partono gli addebiti');
    assert.equal(m.blockingShortfall,36);
    assert.equal(m.spendable,0);
  }

  {
    const m=E.calculate({
      accounts:[{id:1,balance:1000,protected:false}],budgets:[],commitments:[],goals:[],settings,
      liabilities:[
        {id:1,name:'Gia attiva',monthly:40,completed:false,completedInstallments:1,nextDueDate:'2026-11-01'},
        {id:2,name:'Futura',monthly:100,completed:false,completedInstallments:0,nextDueDate:'2026-12-15'}
      ]
    },now);
    assert.equal(m.fixed,40,'una rata futura non deve pesare prima della prima scadenza');
  }

  {
    const m=E.calculate({
      accounts:[{id:1,balance:1000,protected:false}],
      budgets:[{id:1,targetBudget:400,spent:0},{id:2,targetBudget:60,spent:0},{id:3,targetBudget:30,spent:0}],
      commitments:[],
      liabilities:[{id:1,monthly:300,completed:false,completedInstallments:2,nextDueDate:'2026-11-01'}],
      goals:[{id:1,name:'Obiettivo',target:5000,current:500,targetDate:'2027-10-01',priority:'Alta'}],settings
    },now);
    assert.equal(m.monthlyBudget,490);
    assert.equal(m.fixed,300);
    assert.equal(m.goalCapacity,710);
  }

  {
    const p=E.projection({
      accounts:[],budgets:[{id:1,targetBudget:400}],commitments:[],goals:[],settings,
      liabilities:[{id:1,monthly:100,completed:false,completedInstallments:0,firstDueDate:'2026-12-15',finalDueDate:'2027-01-15'}]
    },4,now);
    assert.equal(p[0].month,'2026-10');
    assert.equal(p[0].fixed,0);
    assert.equal(p[1].fixed,0);
    assert.equal(p[2].fixed,100);
    assert.equal(p[3].fixed,100);
  }

  {
    const p=E.projection({
      accounts:[],budgets:[],liabilities:[],goals:[],settings,
      commitments:[{id:1,name:'Servizio mensile',amount:25,dueDate:'2026-11-08',cadence:'Mensile',recurring:true,active:true}]
    },3,now);
    assert.deepEqual(p.map(x=>x.fixed),[25,25,25],'una ricorrenza gia attiva non deve iniziare dalla prossima dueDate');
    const m=E.calculate({accounts:[],budgets:[],liabilities:[],goals:[],settings,commitments:[{id:1,name:'Servizio mensile',amount:25,dueDate:'2026-11-08',cadence:'Mensile',recurring:true,active:true}]},now);
    assert.equal(m.fixed,25,'il mese tipo deve includere una ricorrenza gia attiva');
  }

  {
    const p=E.projection({
      accounts:[],budgets:[],liabilities:[],goals:[],settings,
      commitments:[{id:1,name:'Nuovo servizio',amount:30,dueDate:'2026-12-05',firstDueDate:'2026-12-05',cadence:'Mensile',recurring:true,active:true}]
    },4,now);
    assert.deepEqual(p.map(x=>x.fixed),[0,30,30,30],'il ciclo di novembre comprende la scadenza del 5 dicembre');
    const m=E.calculate({accounts:[],budgets:[],liabilities:[],goals:[],settings,commitments:[{id:1,name:'Nuovo servizio',amount:30,dueDate:'2026-12-05',firstDueDate:'2026-12-05',cadence:'Mensile',recurring:true,active:true}]},now);
    assert.equal(m.fixed,0,'una ricorrenza futura non deve pesare nel mese tipo corrente');
  }

  {
    const snapshot={
      accounts:[],
      budgets:[{id:1,name:'Budget A',targetBudget:400},{id:2,name:'Budget B',targetBudget:130}],
      liabilities:[{id:1,name:'Rate',monthly:352.91,completed:false,completedInstallments:1,nextDueDate:'2026-11-01'}],
      commitments:[{id:1,name:'Ricorrenti',amount:187.54,dueDate:'2026-11-01',cadence:'Mensile',recurring:true,active:true}],
      goals:[],settings
    };
    const b=E.monthBreakdown(snapshot,'2026-10',now);
    assert.equal(b.salaryNet,1500);
    assert.equal(b.budgetTotal,530);
    cents(b.rateTotal,352.91);
    cents(b.recurringTotal,187.54);
    cents(b.fixedTotal,540.45);
    cents(b.plannedOutflow,1070.45);
    cents(b.capacity,429.55);
    const p=E.projection(snapshot,1,now)[0];
    assert.equal(p.monthlyBudget,b.budgetTotal);
    cents(p.rateTotal,b.rateTotal);
    cents(p.recurringTotal,b.recurringTotal);
    cents(p.capacity,b.capacity,'proiezione e dettaglio mensile devono usare la stessa fonte');
  }

  {
    assert.equal(E.salaryDate([{key:'salaryDay',value:10}],new Date(2026,9,26,12)),'2026-11-10');
    assert.equal(E.cycleStart([{key:'salaryDay',value:10}],new Date(2026,9,26,12)),'2026-10-10');
  }

  {
    const added=[];
    const db={put:async()=>{},add:async(store,value)=>{added.push({store,value});return added.length}};
    await E.repairSchedules(db,{
      liabilities:[],
      commitments:[{id:1,name:'Ricorrente',amount:20,dueDate:'2026-10-01',cadence:'Mensile',recurring:true,active:true}]
    },now);
    assert.equal(added.length,0,'una ricorrenza scaduta ma non pagata non deve generare la successiva');
  }

  {
    const added=[];
    const db={put:async()=>{},add:async(store,value)=>{added.push({store,value});return added.length}};
    await E.repairSchedules(db,{
      liabilities:[],
      commitments:[{id:1,name:'Ricorrente',amount:20,dueDate:'2026-10-01',cadence:'Mensile',recurring:true,active:false,paidDate:'2026-10-01'}]
    },now);
    assert.equal(added.length,1,'una ricorrenza pagata deve generare la scadenza successiva');
    assert.equal(added[0].value.dueDate,'2026-11-01');
  }

  {
    const on=new Date(2026,10,5,12);
    const recurring=[{id:71,name:'Servizio periodico',amount:31.27,dueDate:'2026-11-17',cadence:'Mensile',recurring:true,active:true,accountId:1}];
    const original=JSON.stringify(recurring);
    const planned=E.scheduledCommitments(recurring,on,3);
    assert.deepEqual(planned.map(x=>x.dueDate),['2026-11-17','2026-12-17','2027-01-17'],'mostra tutte le scadenze mensili nei prossimi tre mesi senza richiedere il pagamento precedente');
    assert.equal(planned[0].projected,undefined,'la prima e una scadenza reale');
    assert.equal(planned[1].projected,true,'le prossime sono previsioni');
    assert.equal(planned[1].sourceCommitmentId,71);
    assert.equal(JSON.stringify(recurring),original,'le previsioni non modificano IndexedDB');
    const afterPayment=[
      {...recurring[0],active:false,paidDate:'2026-11-17'},
      {...recurring[0],id:72,dueDate:'2026-12-17',active:true}
    ];
    const moved=E.scheduledCommitments(afterPayment,on,3);
    assert.equal(moved.filter(x=>x.dueDate==='2026-12-17').length,1,'nessun doppione quando la scadenza diventa reale');
    assert.equal(moved.find(x=>x.dueDate==='2026-12-17').projected,undefined);
    assert.equal(E.scheduledCommitments([],on,3).length,0,'le ricorrenze terminate non restano come fantasmi');
  }


  // Payday-cycle regression: November covers 10 November to 9 December.
  {
    const cycleNow=new Date(2026,10,10,12);
    const dyson={id:3,name:'Prestito simulato',monthly:47.31,firstDueDate:'2026-01-01',
      nextDueDate:'2026-12-04',recurrenceEnd:'2026-12-04',completed:false};
    const paid={id:31,liabilityId:3,name:'Prestito simulato',amount:47.31,dueDate:'2026-11-04',
      active:false,paidDate:'2026-11-04',cadence:'Mensile',recurring:true};
    const december={id:32,liabilityId:3,name:'Prestito simulato',amount:47.31,dueDate:'2026-12-04',
      active:true,cadence:'Mensile',recurring:true};
    const data={accounts:[],budgets:[],settings,goals:[],liabilities:[dyson],
      commitments:[paid,december]};
    const month=E.monthBreakdown(data,'2026-11',cycleNow);
    assert.equal(month.cycleStart,'2026-11-10');
    assert.equal(month.cycleEnd,'2026-12-10');
    cents(month.rateTotal,47.31);
    assert.deepEqual(month.rateItems.map(x=>x.date),['2026-12-04'],
      'la rata Prestito simulato di dicembre va nel ciclo novembre, non quella gia pagata');
    const projection=E.projection(data,2,cycleNow);
    cents(projection[0].rateTotal,47.31);
    cents(projection[1].rateTotal,0);
    const afterPayment=E.monthBreakdown({...data,commitments:[
      {...paid}, {...december,active:false,paidDate:'2026-12-04'}]},
      '2026-11',cycleNow);
    cents(afterPayment.rateTotal,0,'una rata pagata non va riservata di nuovo');
  }

  {
    const on=new Date(2026,10,10,12);
    const s={accounts:[],budgets:[],settings,goals:[],liabilities:[],
      commitments:[
        {id:1,name:'Una tantum',amount:50,dueDate:'2026-11-25',
          active:true,cadence:'Una tantum',recurring:false},
        {id:2,name:'Ogni tre settimane',amount:20,dueDate:'2026-11-11',
          active:true,cadence:'Ogni 21 giorni',recurring:true},
        {id:3,name:'Gia pagata',amount:18,dueDate:'2026-11-17',
          active:false,paidDate:'2026-11-17',cadence:'Una tantum',recurring:false}
      ]};
    const breakdown=E.monthBreakdown(s,'2026-11',on);
    cents(breakdown.oneOffTotal,50);
    cents(breakdown.recurringTotal,40);
    cents(breakdown.fixedTotal,90);
    assert.deepEqual(breakdown.recurringItems.map(x=>x.date),['2026-11-11','2026-12-02']);
    assert.equal(E.nextDateByCadence('2026-11-11','Settimanale'),'2026-11-18');
    assert.equal(E.nextDateByCadence('2026-11-11','Ogni 14 giorni'),'2026-11-25');
    assert.equal(E.nextDateByCadence('2026-11-11','Ogni 21 giorni'),'2026-12-02');
    assert.equal(E.nextDateByCadence('2026-11-11','Mensile'),'2026-12-11');
    assert.equal(E.nextDateByCadence('2026-11-11','Una tantum'),null);
    const overdue=E.monthBreakdown({...s,commitments:[
      {id:4,name:'Uscita scaduta',amount:15,dueDate:'2026-10-25',
        active:true,cadence:'Una tantum'}]},'2026-11',on);
    cents(overdue.overdueTotal,15,'il ciclo attuale riporta gli arretrati del ciclo precedente');
  }

  {
    const on=new Date(2026,10,10,12);
    const b=E.monthBreakdown({
      budgets:[{id:1,name:'Vita',targetBudget:400,spent:150}],
      commitments:[],liabilities:[],goals:[],settings
    },'2026-11',on);
    cents(b.budgetTotal,250,'il ciclo corrente considera soltanto budget ancora da spendere');
    const future=E.monthBreakdown({
      budgets:[{id:1,name:'Vita',targetBudget:400,spent:150}],
      commitments:[],liabilities:[],goals:[],settings
    },'2026-12',on);
    cents(future.budgetTotal,400,'per un ciclo futuro si considera il budget pieno');
  }

  {
    const on=new Date(2026,10,10,12);
    const final=E.monthBreakdown({settings,budgets:[],goals:[],commitments:[],
      liabilities:[{id:8,name:'Finanziamento finale',monthly:0,monthlyPhaseComplete:true,
        finalPayment:200,finalPaymentDate:'2026-12-01',completed:false}]},
      '2026-11',on);
    cents(final.rateTotal,200,'il pagamento finale deve comparire anche dopo la fine delle rate ordinarie');
  }

  {
    // A stale nextDueDate from January must not hide a December installment
    // from the November salary cycle. It is a forecast, not a saved payment.
    const on=new Date(2026,10,10,12);
    const b=E.monthBreakdown({settings,budgets:[],goals:[],commitments:[],
      liabilities:[{id:42,name:'Prestito non aggiornato',monthly:55,
        nextDueDate:'2026-01-01',firstDueDate:'2026-01-01',
        recurrenceEnd:'2026-12-01',completed:false}]},
      '2026-11',on);
    cents(b.rateTotal,55);
    assert.deepEqual(b.rateItems.map(x=>x.date),['2026-12-01']);
    assert.equal(b.rateItems[0].projected,true);
  }

  {
    // A zero residual alone must not silently close an unpaid plan.
    const changes=[];
    const db={put:async(store,value)=>changes.push({store,value}),add:async()=>0};
    const loan={id:70,name:'Finanziamento sintetico',monthly:35,
      remaining:0,installmentsRemaining:0,completed:false,
      nextDueDate:'2026-12-01',firstDueDate:'2026-01-01',archived:false};
    await E.repairSchedules(db,{liabilities:[loan],commitments:[]},new Date(2026,10,10,12));
    assert.ok(!changes.some(x=>x.store==='liabilities'&&x.value.completed),
      'la manutenzione non deve chiudere un piano con una scadenza ancora impostata');
    const month=E.loanCycleAudit({liabilities:[loan],commitments:[],
      settings,budgets:[]},'2026-11',new Date(2026,10,10,12));
    assert.equal(month[0].open,true);
    assert.equal(month[0].code,'included');
    assert.equal(month[0].due[0].date,'2026-12-01');
  }

  {
    // An excluded loan stays excluded and appears in the local audit, never
    // silently restored or counted as a new payment.
    const loan={id:91,name:'Prestito sintetico',monthly:50,
      nextDueDate:'2026-12-01',firstDueDate:'2026-01-01'};
    const entries=[
      {...loan,id:1,completed:true},
      {...loan,id:2,archived:true},
      {...loan,id:3,monthlyPhaseComplete:true},
      {...loan,id:4,nextDueDate:'',firstDueDate:''}
    ];
    const a=E.loanCycleAudit({liabilities:entries,commitments:[],
      settings,budgets:[]},'2026-11',new Date(2026,10,10,12));
    const codes=a.map(x=>x.code);
    for(const code of ['completed','archived','phase','no-date'])
      assert.ok(codes.includes(code),'diagnostic must report '+code);
    const b=E.monthBreakdown({liabilities:entries,commitments:[],settings,budgets:[]},
      '2026-11',new Date(2026,10,10,12));
    cents(b.rateTotal,0,'non vengono riattivati debiti senza conferma');
  }

  console.log('Financial engine tests: OK');
}

main().catch(err=>{console.error(err);process.exit(1)});
