const assert=require('node:assert/strict');
const fs=require('node:fs');

const html=fs.readFileSync('index.html','utf8');
const app=fs.readFileSync('app.js','utf8');
const salary=fs.readFileSync('salary-guide.js','utf8');
const css=fs.readFileSync('home-clean.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const home=html.split('<section id="view-today"')[1]?.split('<section id="view-movements"')[0]||'';

for(const id of ['spendCard','spendValue','upcomingList','upcomingCycle',
  'homeDueFoot','salaryGuide','salaryGuideForm','salaryGuideSummaryMeta',
  'accountsStrip','homeManageAccounts','homeSpendingValue','homeSpendingNote']){
  assert.ok(home.includes('id="'+id+'"'),'Missing Home component: '+id);
}
assert.match(home,/<details id="salaryGuide"[^>]*>/,
  'salary action should be collapsed in a native accessible details element');
assert.doesNotMatch(home,/<details id="salaryGuide"[^>]*\sopen(?:\s|>)/,
  'salary form should not be open by default');
for(const outdated of ['id="monthlyPlan"','id="primaryGoal"','home-loan-shortcut',
  'home-update-status']){
  assert.ok(!home.includes(outdated),'Remove duplicated or technical Home UI: '+outdated);
}
assert.ok(app.includes("FinanceEngine.accountAvailability(state,now)"),
  'Home must calculate free bank cash per account, not global cash or goal savings');
assert.ok(app.includes("availability.spendingAvailable"),
  'Daily spending must use the already-funded spending-account budget');
assert.ok(app.includes("FinanceEngine.monthBreakdown(state,currentCycle,now)"),
  'Home bills must come from the salary cycle, not a calendar-month estimate');
assert.ok(app.includes('dues.slice(0,3)'),'Home should show only the first three bills');
assert.ok(!app.includes('function renderMonthCard('),'The redundant month card should be removed');
assert.ok(salary.includes("finanze.salaryGuide.open"),
  'Salary form expansion should be remembered during the session');
const version=html.match(/<meta name="finanze-version" content="([^"]+)"/)?.[1];
assert.ok(version,'Published version must be visible in metadata');
assert.ok(html.includes('home-clean.css?v='+version));
assert.ok(sw.includes("const V='"+version+"'"));
assert.ok(css.includes('.home-salary>summary'),'Salary action requires accessible collapsed styling');

console.log('Finanze focused Home UI tests: OK');
