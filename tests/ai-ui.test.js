const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('ai-chat.css','utf8');
const js=fs.readFileSync('ai-chat.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');

const ids=[
  'view-ai','aiStatus','aiStatusDot','aiNewChatButton','aiConfigButton',
  'aiSetup','aiSetupForm','aiSetupError','aiSetupErrorText','aiWorkerInput','aiTokenInput',
  'aiChatArea','aiShare','aiContextStatus','aiPrivacyText','aiMessages','aiSuggestions',
  'aiScrollBottomButton','aiError','aiErrorText','aiRetryButton','aiPrompt',
  'aiSendButton','aiStopButton','aiCharCount','aiComposerHint','aiChatForm'
];
for(const id of ids){
  assert.ok(html.includes('id="'+id+'"'),'Missing chat element #'+id);
}
assert.match(css,/#view-ai\.active\s*\{/,'immersive chat should have own viewport layout');
assert.match(css,/\.ai-transcript-wrap\s*\{/,'conversation should have isolated scroll viewport');
assert.match(css,/body\.ai-chat-focused/,'mobile keyboard should not overlap bottom navigation');
assert.match(js,/localStorage\.setItem\(DRAFT_KEY/,'draft must survive a reload');
assert.match(js,/AbortController/,'user must be able to stop requests');
assert.match(js,/navigator\.clipboard\.writeText/,'responses should support copying');
assert.match(js,/document\.createTextNode/,'assistant answers must use safe DOM formatting');
assert.match(html,/ai-chat\.js\?v=20261109a/);
assert.match(sw,/const V='20261109a'/);
console.log('Finanze AI UI/UX integration tests: OK');
