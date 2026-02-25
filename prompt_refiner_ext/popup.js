// PromptRefiner Extension - popup.js
// All event handlers attached via addEventListener (MV3 CSP compliant)

const API = 'http://localhost:8000';
let config = null;
let activeMode = 'professional';
let activeToggles = new Set();
let activePipeline = 'full_review';
let lastResult = null;
let lastAgResult = null;

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const saved = await chrome.storage.local.get([
    'activeMode','activeToggles','persona','temperature','model','customInstructions','activePipeline'
  ]);
  if (saved.activeMode) activeMode = saved.activeMode;
  if (saved.activeToggles) activeToggles = new Set(saved.activeToggles);
  if (saved.activePipeline) activePipeline = saved.activePipeline;

  try {
    const [sResp, mResp] = await Promise.all([
      fetch(API + '/api/settings'), fetch(API + '/api/models')
    ]);
    config = await sResp.json();
    const mData = await mResp.json();

    renderModes();
    renderPersonas(saved.persona);
    renderToggles();
    renderModels(mData.models, saved.model);
    renderPresets();
    renderPipelines();

    if (saved.temperature !== undefined) {
      document.getElementById('tempSlider').value = saved.temperature;
      document.getElementById('tempVal').textContent = saved.temperature;
    }
    if (saved.customInstructions) document.getElementById('customInput').value = saved.customInstructions;

    document.getElementById('dot').classList.add('on');
  } catch(e) {
    showErr('errBox', 'Backend offline. Run start.bat first.');
  }

  // ---- Attach all event listeners ----

  // Temperature slider
  document.getElementById('tempSlider').addEventListener('input', function() {
    document.getElementById('tempVal').textContent = this.value;
    save();
  });

  // Custom instructions
  document.getElementById('customInput').addEventListener('change', save);

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { showPage(this); });
  });

  // Grab buttons (all of them)
  document.querySelectorAll('.grab-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var type = this.getAttribute('data-grab');
      var target = this.getAttribute('data-target');
      grabText(type, target, this);
    });
  });

  // Refine / Chain buttons
  document.getElementById('refineBtn').addEventListener('click', doRefine);
  document.getElementById('chainBtn').addEventListener('click', doChain);

  // Output tabs
  document.querySelectorAll('.out-tab').forEach(function(tab) {
    tab.addEventListener('click', function() { outTab(this); });
  });

  // Copy / Replace buttons
  document.getElementById('copyBtn').addEventListener('click', copyOut);
  document.getElementById('replBtn').addEventListener('click', function() { replaceOnPage('refine'); });

  // Agentic
  document.getElementById('agBtn').addEventListener('click', doAgentic);
  document.getElementById('agCopy').addEventListener('click', copyAg);
  document.getElementById('agRepl').addEventListener('click', function() { replaceOnPage('ag'); });

  // Context menu text
  var params = new URLSearchParams(window.location.search);
  if (params.get('fromContext') === '1') {
    var p = await chrome.storage.local.get('pendingText');
    if (p.pendingText) {
      document.getElementById('promptInput').value = p.pendingText;
      chrome.storage.local.remove('pendingText');
    }
  }

  loadHistory();
}

// ========== SAVE ==========
function save() {
  chrome.storage.local.set({
    activeMode: activeMode,
    activeToggles: Array.from(activeToggles),
    persona: document.getElementById('personaSelect').value,
    temperature: document.getElementById('tempSlider').value,
    model: document.getElementById('modelSelect').value,
    customInstructions: document.getElementById('customInput').value,
    activePipeline: activePipeline,
  });
}

// ========== RENDER ==========
function renderModes() {
  var c = document.getElementById('modeChips');
  c.innerHTML = '';
  config.refinement_modes.forEach(function(m) {
    var el = document.createElement('div');
    el.className = 'chip' + (m.id === activeMode ? ' active' : '');
    el.textContent = m.name;
    el.title = m.description;
    el.setAttribute('data-mode-id', m.id);
    el.addEventListener('click', function() {
      activeMode = m.id;
      c.querySelectorAll('.chip').forEach(function(x) { x.classList.remove('active'); });
      el.classList.add('active');
      save();
      clearPresetHighlight();
    });
    c.appendChild(el);
  });
}

function renderPersonas(saved) {
  var s = document.getElementById('personaSelect');
  s.innerHTML = '';
  config.personas.forEach(function(p) {
    var o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.icon + ' ' + p.name;
    s.appendChild(o);
  });
  s.value = saved || 'none';
  s.addEventListener('change', function() { save(); clearPresetHighlight(); });
}

function renderToggles() {
  var g = document.getElementById('toggleGrid');
  g.innerHTML = '';
  config.toggles.forEach(function(t) {
    var el = document.createElement('div');
    el.className = 'tgl' + (activeToggles.has(t.id) ? ' on' : '');
    el.title = t.description;
    el.innerHTML = '<div class="tgl-box">' + (activeToggles.has(t.id) ? '\u2713' : '') + '</div><span class="tgl-name">' + t.name + '</span>';
    el.addEventListener('click', function() {
      if (activeToggles.has(t.id)) {
        activeToggles.delete(t.id);
        el.classList.remove('on');
        el.querySelector('.tgl-box').textContent = '';
      } else {
        activeToggles.add(t.id);
        el.classList.add('on');
        el.querySelector('.tgl-box').textContent = '\u2713';
      }
      save();
      clearPresetHighlight();
    });
    g.appendChild(el);
  });
}

function renderModels(models, saved) {
  var s = document.getElementById('modelSelect');
  s.innerHTML = '';
  models.forEach(function(m) {
    var o = document.createElement('option');
    o.value = m; o.textContent = m;
    s.appendChild(o);
  });
  var pref = ['llama3.1:8b','llama3:8b','qwen2.5:7b','mistral:7b'];
  if (saved && models.indexOf(saved) !== -1) { s.value = saved; }
  else {
    for (var i = 0; i < pref.length; i++) {
      if (models.indexOf(pref[i]) !== -1) { s.value = pref[i]; break; }
    }
  }
  if (!s.value && models.length) s.value = models[0];
  s.addEventListener('change', save);
}

function renderPresets() {
  var g = document.getElementById('presetGrid');
  g.innerHTML = '';
  var presets = config.presets || [];
  presets.forEach(function(p) {
    var el = document.createElement('div');
    el.className = 'preset';
    el.setAttribute('data-preset-id', p.id);
    el.innerHTML = '<div class="preset-name">' + p.name + '</div><div class="preset-desc">' + p.description + '</div>';
    el.addEventListener('click', function() { applyPreset(p, el); });
    g.appendChild(el);
  });
}

function applyPreset(p, el) {
  activeMode = p.mode;
  document.querySelectorAll('#modeChips .chip').forEach(function(c) {
    var modeName = '';
    config.refinement_modes.forEach(function(m) { if (m.id === p.mode) modeName = m.name; });
    c.classList.toggle('active', c.textContent === modeName);
  });
  document.getElementById('personaSelect').value = p.persona;
  activeToggles = new Set(p.toggles);
  renderToggles();
  document.querySelectorAll('.preset').forEach(function(x) { x.classList.remove('active'); });
  el.classList.add('active');
  save();
}

function clearPresetHighlight() {
  document.querySelectorAll('.preset').forEach(function(x) { x.classList.remove('active'); });
}

function renderPipelines() {
  var c = document.getElementById('pipelineList');
  c.innerHTML = '';
  var pipes = config.agentic_pipelines || [];
  pipes.forEach(function(p) {
    if (p.id === 'custom') return;
    var el = document.createElement('div');
    el.className = 'pipe-card' + (p.id === activePipeline ? ' active' : '');
    var agentsHtml = '';
    if (p.agents && p.agents.length) {
      agentsHtml = '<div class="pipe-agents">';
      p.agents.forEach(function(a, i) {
        agentsHtml += '<span class="pipe-agent">' + a.role + '</span>';
        if (i < p.agents.length - 1) agentsHtml += '<span class="pipe-arrow">\u2192</span>';
      });
      agentsHtml += '</div>';
    }
    el.innerHTML = '<div class="pipe-name">' + p.name + '</div><div class="pipe-desc">' + p.description + '</div>' + agentsHtml;
    el.addEventListener('click', function() {
      activePipeline = p.id;
      c.querySelectorAll('.pipe-card').forEach(function(x) { x.classList.remove('active'); });
      el.classList.add('active');
      save();
    });
    c.appendChild(el);
  });
}

// ========== PAGE NAV ==========
function showPage(tab) {
  document.querySelectorAll('.nav-tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.page').forEach(function(p) { p.classList.remove('active'); });
  tab.classList.add('active');
  document.getElementById('page-' + tab.getAttribute('data-page')).classList.add('active');
  if (tab.getAttribute('data-page') === 'history') loadHistory();
}

// ========== GRAB TEXT ==========
async function grabText(type, targetId, btnEl) {
  var target = document.getElementById(targetId);
  var errId = (targetId === 'agInput') ? 'agErrBox' : 'errBox';
  try {
    if (type === 'clip') {
      var t = await navigator.clipboard.readText();
      if (t && t.trim()) { target.value = t.trim(); flash(btnEl); return; }
      showErr(errId, 'Clipboard empty.'); return;
    }
    var tabs = await chrome.tabs.query({active:true, currentWindow:true});
    var tab = tabs[0];
    var results;
    if (type === 'sel') {
      results = await chrome.scripting.executeScript({ target:{tabId:tab.id}, func:function(){ return window.getSelection().toString(); } });
    } else {
      results = await chrome.scripting.executeScript({ target:{tabId:tab.id}, func:function(){
        var el=document.activeElement;
        if(el&&(el.tagName==='TEXTAREA'||el.tagName==='INPUT'||el.isContentEditable)) return el.isContentEditable?el.innerText:el.value;
        var tas=document.querySelectorAll('textarea'); var best=null;
        for(var i=0;i<tas.length;i++) if(!best||tas[i].value.length>best.value.length) best=tas[i];
        if(best&&best.value.trim()) return best.value;
        var eds=document.querySelectorAll('[contenteditable="true"]');
        for(var j=0;j<eds.length;j++) if(eds[j].innerText.trim()) return eds[j].innerText;
        return null;
      }});
    }
    var text = results[0] && results[0].result;
    if (text && text.trim()) { target.value = text.trim(); flash(btnEl); }
    else showErr(errId, 'No text found.');
  } catch(e) { showErr(errId, 'Cannot access page.'); }
}

// ========== REPLACE ON PAGE ==========
async function replaceOnPage(mode) {
  var text = (mode === 'ag') ? (lastAgResult && lastAgResult.final_prompt) : (lastResult && lastResult.refined_prompt);
  if (!text) return;
  try {
    var tabs = await chrome.tabs.query({active:true, currentWindow:true});
    await chrome.scripting.executeScript({
      target:{tabId:tabs[0].id},
      func:function(t){
        var el=document.activeElement;
        if(el&&(el.tagName==='TEXTAREA'||el.tagName==='INPUT')){el.value=t;el.dispatchEvent(new Event('input',{bubbles:true}));return;}
        if(el&&el.isContentEditable){el.innerText=t;el.dispatchEvent(new Event('input',{bubbles:true}));return;}
        var tas=document.querySelectorAll('textarea');
        for(var i=0;i<tas.length;i++) if(tas[i].offsetParent!==null){tas[i].value=t;tas[i].dispatchEvent(new Event('input',{bubbles:true}));return;}
      }, args:[text]
    });
    flashOk(mode === 'ag' ? 'agRepl' : 'replBtn', 'Done!');
  } catch(e) { showErr(mode === 'ag' ? 'agErrBox' : 'errBox', 'Cannot replace.'); }
}

// ========== API: REFINE ==========
function getBody() {
  return {
    prompt: document.getElementById('promptInput').value,
    mode: activeMode,
    persona: document.getElementById('personaSelect').value,
    toggles: Array.from(activeToggles),
    model: document.getElementById('modelSelect').value,
    temperature: parseFloat(document.getElementById('tempSlider').value),
    custom_instructions: document.getElementById('customInput').value,
  };
}

async function doRefine() {
  var b = getBody();
  if (!b.prompt.trim()) return showErr('errBox','Enter a prompt.');
  hideErr('errBox');
  setLoading('refineBtn', true, 'Refining...');
  try {
    var r = await fetch(API + '/api/refine', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b)});
    if (!r.ok) { var err = await r.json().catch(function(){return {};}); throw new Error(err.detail || 'Error ' + r.status); }
    lastResult = await r.json();
    showOutput(lastResult);
  } catch(e) { showErr('errBox', e.message); }
  finally { setLoading('refineBtn', false, 'Refine'); }
}

async function doChain() {
  var b = getBody();
  if (!b.prompt.trim()) return showErr('errBox','Enter a prompt.');
  hideErr('errBox');
  setLoading('chainBtn', true, 'Double...');
  try {
    var r = await fetch(API + '/api/refine/chain', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(b)});
    if (!r.ok) { var err = await r.json().catch(function(){return {};}); throw new Error(err.detail || 'Error ' + r.status); }
    var d = await r.json();
    var res = d.pass_2 || d.pass_1;
    if (d.pass_1) res.composed_system_prompt = d.pass_1.composed_system_prompt;
    lastResult = res;
    showOutput(res);
  } catch(e) { showErr('errBox', e.message); }
  finally { setLoading('chainBtn', false, 'Double'); }
}

function showOutput(d) {
  document.getElementById('outputSection').style.display = '';
  document.getElementById('outRefined').textContent = d.refined_prompt || d.raw_response || '--';
  document.getElementById('outChangelog').textContent = d.changelog || 'No changelog.';
  document.getElementById('outSystem').textContent = d.composed_system_prompt || '';

  var ow = document.getElementById('promptInput').value.trim().split(/\s+/).filter(Boolean).length;
  var rw = (d.refined_prompt || '').trim().split(/\s+/).filter(Boolean).length;
  var ratio = ow > 0 ? Math.round((rw / ow) * 100) : 0;
  document.getElementById('metricsRow').innerHTML =
    '<div class="mc"><div class="mc-l">Original</div><div class="mc-v">' + ow + 'w</div></div>' +
    '<div class="mc"><div class="mc-l">Refined</div><div class="mc-v">' + rw + 'w</div></div>' +
    '<div class="mc"><div class="mc-l">Ratio</div><div class="mc-v ' + (ratio > 200 ? 'o' : 'g') + '">' + ratio + '%</div></div>';
  outTab(document.querySelector('.out-tab.active'));
}

function outTab(el) {
  document.querySelectorAll('.out-tab').forEach(function(t) { t.classList.remove('active'); });
  el.classList.add('active');
  var m = {refined:'outRefined', changelog:'outChangelog', system:'outSystem'};
  Object.keys(m).forEach(function(k) { document.getElementById(m[k]).style.display = 'none'; });
  document.getElementById(m[el.getAttribute('data-out')]).style.display = '';
}

function copyOut() {
  if (!lastResult) return;
  var tab = document.querySelector('.out-tab.active').getAttribute('data-out');
  var t = tab === 'refined' ? lastResult.refined_prompt : tab === 'changelog' ? lastResult.changelog : (lastResult.composed_system_prompt || '');
  navigator.clipboard.writeText(t).then(function() { flashOk('copyBtn', 'Copied!'); });
}

// ========== API: AGENTIC ==========
async function doAgentic() {
  var prompt = document.getElementById('agInput').value.trim();
  if (!prompt) return showErr('agErrBox','Enter a prompt.');
  hideErr('agErrBox');
  setLoading('agBtn', true, 'Running...');
  try {
    var r = await fetch(API + '/api/refine/agentic', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        prompt: prompt,
        pipeline_id: activePipeline,
        model: document.getElementById('modelSelect').value,
        temperature: parseFloat(document.getElementById('tempSlider').value),
      })
    });
    if (!r.ok) { var err = await r.json().catch(function(){return {};}); throw new Error(err.detail || 'Error ' + r.status); }
    lastAgResult = await r.json();
    showAgOutput(lastAgResult);
  } catch(e) { showErr('agErrBox', e.message); }
  finally { setLoading('agBtn', false, 'Run Pipeline'); }
}

function showAgOutput(d) {
  document.getElementById('agOutput').style.display = '';
  var steps = document.getElementById('agSteps');
  steps.innerHTML = '';
  d.steps.forEach(function(s, i) {
    var el = document.createElement('div');
    el.className = 'agent-step';
    var preview = s.output.length > 300 ? s.output.slice(0, 300) + '...' : s.output;
    var roleDiv = document.createElement('div');
    roleDiv.className = 'step-role';
    roleDiv.textContent = 'Step ' + (i + 1) + ': ' + s.agent;
    el.appendChild(roleDiv);

    var textDiv = document.createElement('div');
    textDiv.className = 'step-text';
    textDiv.textContent = preview;
    el.appendChild(textDiv);

    if (s.output.length > 300) {
      var togDiv = document.createElement('div');
      togDiv.className = 'step-toggle';
      togDiv.textContent = 'Show full';
      (function(fullText, textEl, togEl) {
        togEl.addEventListener('click', function() {
          if (togEl.textContent === 'Show full') {
            textEl.textContent = fullText;
            togEl.textContent = 'Collapse';
          } else {
            textEl.textContent = fullText.slice(0, 300) + '...';
            togEl.textContent = 'Show full';
          }
        });
      })(s.output, textDiv, togDiv);
      el.appendChild(togDiv);
    }
    steps.appendChild(el);
  });
  document.getElementById('agFinal').textContent = d.final_prompt;
}

function copyAg() {
  if (!lastAgResult) return;
  navigator.clipboard.writeText(lastAgResult.final_prompt).then(function() { flashOk('agCopy', 'Copied!'); });
}

// ========== HISTORY ==========
async function loadHistory() {
  try {
    var r = await fetch(API + '/api/history?limit=20');
    var d = await r.json();
    var list = document.getElementById('histList');
    if (!d.history.length) { list.innerHTML = '<div class="hist-empty">No refinements yet.</div>'; return; }
    list.innerHTML = '';
    d.history.forEach(function(h) {
      var el = document.createElement('div');
      el.className = 'hist-item';
      var time = new Date(h.timestamp * 1000).toLocaleTimeString();
      var preview = h.original.length > 80 ? h.original.slice(0, 80) + '...' : h.original;

      var metaDiv = document.createElement('div');
      metaDiv.className = 'hist-meta';
      metaDiv.innerHTML = '<span>' + time + '</span><span class="tag">' + h.type + '</span><span class="tag">' + (h.mode || h.pipeline || '') + '</span>';
      el.appendChild(metaDiv);

      var origDiv = document.createElement('div');
      origDiv.className = 'hist-orig';
      origDiv.textContent = preview;
      el.appendChild(origDiv);

      el.addEventListener('click', function() {
        document.getElementById('promptInput').value = h.original;
        showPage(document.querySelector('[data-page="refine"]'));
      });
      list.appendChild(el);
    });
  } catch(e) {
    document.getElementById('histList').innerHTML = '<div class="hist-empty">Cannot load (server offline?)</div>';
  }
}

// ========== HELPERS ==========
function setLoading(id, on, label) {
  var b = document.getElementById(id);
  b.disabled = on;
  if (on) b.innerHTML = '<span class="spin"></span> ' + (label || '...');
  else b.textContent = label || '';
}

function showErr(id, msg) { var e = document.getElementById(id); e.textContent = msg; e.style.display = ''; }
function hideErr(id) { document.getElementById(id).style.display = 'none'; }

function flash(el) {
  el.classList.add('flash');
  setTimeout(function() { el.classList.remove('flash'); }, 800);
}

function flashOk(id, text) {
  var b = document.getElementById(id);
  var orig = b.textContent;
  b.textContent = text;
  b.classList.add('ok');
  setTimeout(function() { b.textContent = orig; b.classList.remove('ok'); }, 1200);
}
