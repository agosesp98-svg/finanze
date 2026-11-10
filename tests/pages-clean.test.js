const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('app.js','utf8');
const css=fs.readFileSync('pages-clean.css','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const v=html.match(/<meta name="finanze-version" content="([^"]+)"/)?.[1];
assert.ok(v,'App release version must be defined');
assert.ok(html.includes('pages-clean.css?v='+v),'New page styling must be shipped');
assert.ok(sw.includes("const V='"+v+"'"),'App and worker versions must match');
const nav=html.match(/<button class="tab(?: active)?" type="button" data-view="([^"]+)"/g)||[];
assert.equal(nav.length,4,'App should only have four main tabs');
for(const view of ['today','movements','plan','goals']){
  assert.ok(html.includes('id="view-'+view+'"'),view+' must be accessible');
}
assert.ok(!html.includes('id="view-ai"'),'AI page should be removed');
assert.ok(!html.includes('data-view="ai"'),'AI tab should be removed');
assert.ok(!html.includes('src="./ai-context.js'),'AI context should not load');
assert.ok(!html.includes('src="./ai-chat.js'),'AI chat should not load');
assert.ok(!html.includes('href="./ai-chat.css'),'AI styles should not load');
assert.ok(!sw.includes('./ai-chat.js'),'Service worker should not cache AI scripts');
assert.ok(!sw.includes('./ai-context.js'),'Service worker should not cache AI context');

const mov=html.split('id="view-movements"')[1].split('id="view-plan"')[0];
for(const id of ['movementCycleExpenses','movementCycleIncomes','movementSearch',
    'movementFilters','movementResultsCount','movementLoadMore','movementList']){
  assert.ok(mov.includes('id="'+id+'"'),'Missing movement element '+id);
}
assert.equal((mov.match(/data-filter="/g)||[]).length,3,'Three uncluttered movement filters');
assert.match(js,/movementLimit=30/,'Lists should be progressively disclosed');
assert.ok(js.includes("movementQuery=e.target.value"),'Search should work');

const plan=html.split('id="view-plan"')[1].split('id="view-goals"')[0];
for(const id of ['planSummary','projectionList','loanManagement','liabilityList',
    'scheduledList','scheduledExpand','budgetList','excludedLoanList',
    'planStrategy','incomeList','historyList']){
  assert.ok(plan.includes('id="'+id+'"'),'Missing plan feature '+id);
}
assert.ok(plan.indexOf('id="projectionList"')<plan.indexOf('id="liabilityList"'),
  'Upcoming salary cycles should be first');
assert.ok(plan.indexOf('id="liabilityList"')<plan.indexOf('id="budgetList"'),
  'Loans should be accessible above budget editing');
assert.match(plan,/<details class="plan-secondary-details"/,'History should be collapsed');

const goals=html.split('id="view-goals"')[1].split('</main>')[0];
for(const id of ['goalTotalSaved','goalTotalRemaining','goalCapacity','goalsCount','goalsList']){
  assert.ok(goals.includes('id="'+id+'"'),'Missing goal element '+id);
}
assert.ok(js.includes("data-contribute"),'Goal deposit action must remain');
assert.ok(js.includes("data-goal"),'Goal edit action must remain');
assert.ok(css.includes('.tabbar{grid-template-columns:repeat(4,minmax(0,1fr))}'),
  'Bottom navigation must have four responsive columns');

console.log('Finanze four-tab redesign and AI removal tests: OK');
