'use strict';
/* 五感ナイトルーティン — 記録はすべて端末内 (localStorage) に保存 */

const SENSES = [
  { id: 'hearing', ico: '👂', name: '聴覚', tip: '環境音を流して、音だけに耳をすます' },
  { id: 'touch',   ico: '✋', name: '触覚', tip: '呼吸のリズムを感じる。手や足先を温める' },
  { id: 'sight',   ico: '👁', name: '視覚', tip: '部屋の明かりを落とす。画面は伏せる' },
  { id: 'smell',   ico: '🌿', name: '嗅覚', tip: 'ラベンダーやヒノキなど、好きな香りを枕元に' },
  { id: 'taste',   ico: '🍵', name: '味覚', tip: '白湯やカフェインなしのお茶をひと口' },
];
/* 振動に対応しているか（iPhoneのブラウザは非対応） */
const CAN_VIBRATE = typeof navigator.vibrate === 'function' && !/iPhone|iPad|iPod/.test(navigator.userAgent);
SENSES[2].tip = '画面が夕暮れ色の灯りになり、3分かけてゆっくり消える。その間に部屋の明かりも消す';
SENSES[1].tip = CAN_VIBRATE
  ? '振動に合わせて呼吸する。ふるえている間に吸って、止まったら吐く'
  : '音の高まりに合わせて呼吸する（この端末は振動に非対応のため、音でガイドします）';
const SOUNDS = [['rain', '雨'], ['wave', '波'], ['deep', '低い音'], ['none', 'なし']];
const MINUTES = [15, 30, 45];
const KEY = 'gokan-v1';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ---------- 保存 ---------- */
let db = { records: {}, prefs: { senses: ['hearing'], sound: 'rain', minutes: 30 } };
try { Object.assign(db, JSON.parse(localStorage.getItem(KEY)) || {}); } catch (e) {}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };

const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/* 「夜」の日付：正午より前は前日の夜として扱う */
function nightKey(d = new Date()) {
  const x = new Date(d);
  if (x.getHours() < 12) x.setDate(x.getDate() - 1);
  return fmt(x);
}
const score = (r) => (r && r.onset && r.fresh ? r.onset + r.fresh : null);

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}

/* ---------- 今夜 ---------- */
function renderTonight() {
  const h = new Date().getHours();
  $('#greeting').textContent = h < 4 ? 'おそくまでおつかれさま' : h < 11 ? 'おはよう' : h < 18 ? 'こんにちは' : 'こんばんは';
  $('#sense-list').innerHTML = SENSES.map((s) => `
    <button class="sense ${db.prefs.senses.includes(s.id) ? 'on' : ''}" data-id="${s.id}" aria-pressed="${db.prefs.senses.includes(s.id)}">
      <span class="ico">${s.ico}</span><span><b>${s.name}</b><small>${s.tip}</small></span><span class="chk"></span>
    </button>`).join('');
  $('#sound-seg').innerHTML = SOUNDS.map(([v, l]) => `<button data-v="${v}" class="${db.prefs.sound === v ? 'on' : ''}">${l}</button>`).join('');
  $('#min-seg').innerHTML = MINUTES.map((m) => `<button data-v="${m}" class="${db.prefs.minutes === m ? 'on' : ''}">${m}分</button>`).join('');
  $('#start-btn').disabled = db.prefs.senses.length === 0;
}
$('#sense-list').addEventListener('click', (e) => {
  const b = e.target.closest('.sense'); if (!b) return;
  const i = db.prefs.senses.indexOf(b.dataset.id);
  i < 0 ? db.prefs.senses.push(b.dataset.id) : db.prefs.senses.splice(i, 1);
  save(); renderTonight();
});
$('#sound-seg').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  db.prefs.sound = e.target.dataset.v; save(); renderTonight();
});
$('#min-seg').addEventListener('click', (e) => {
  if (!e.target.dataset.v) return;
  db.prefs.minutes = +e.target.dataset.v; save(); renderTonight();
});

/* ---------- 音（Web Audioで生成。音声ファイル不要） ---------- */
let actx = null, master = null;
function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!actx && AC) actx = new AC();
  return actx;
}
/* 呼吸ガイド音：吸う4秒で音が高まり、吐く8秒で静かに消える。画面を見ずに呼吸を合わせられる */
let tone = null;
function startTone() {
  if (!getCtx()) return;
  const osc = actx.createOscillator(); osc.type = 'sine'; osc.frequency.value = 110;
  const g = actx.createGain(); g.gain.value = 0;
  osc.connect(g).connect(actx.destination); osc.start();
  tone = { osc, g };
}
function toneBreath(inhale) {
  if (!tone || !actx) return;
  const t = actx.currentTime, d = inhale ? 4 : 8;
  tone.g.gain.cancelScheduledValues(t); tone.g.gain.setValueAtTime(tone.g.gain.value, t);
  tone.g.gain.linearRampToValueAtTime(inhale ? 0.22 : 0.0001, t + d);
  tone.osc.frequency.cancelScheduledValues(t); tone.osc.frequency.setValueAtTime(tone.osc.frequency.value, t);
  tone.osc.frequency.linearRampToValueAtTime(inhale ? 165 : 110, t + d);
}
function startSound(kind) {
  if (kind === 'none') return;
  if (!getCtx()) return;
  const len = actx.sampleRate * 4;
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'rain') d[i] = w * 0.5;
    else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } // ブラウンノイズ
  }
  const src = actx.createBufferSource(); src.buffer = buf; src.loop = true;
  const filt = actx.createBiquadFilter();
  if (kind === 'rain') { filt.type = 'bandpass'; filt.frequency.value = 2500; filt.Q.value = 0.4; }
  else { filt.type = 'lowpass'; filt.frequency.value = kind === 'wave' ? 700 : 300; }
  master = actx.createGain(); master.gain.value = 0;
  master.gain.linearRampToValueAtTime(kind === 'rain' ? 0.25 : 0.6, actx.currentTime + 3);
  src.connect(filt);
  if (kind === 'wave') { // ゆっくり寄せては返す
    const swell = actx.createGain(); swell.gain.value = 0.55;
    const lfo = actx.createOscillator(); lfo.frequency.value = 0.09;
    const depth = actx.createGain(); depth.gain.value = 0.45;
    lfo.connect(depth).connect(swell.gain); lfo.start();
    filt.connect(swell).connect(master);
  } else filt.connect(master);
  master.connect(actx.destination); src.start();
}
function stopSound() {
  if (!actx) return;
  const a = actx; actx = null;
  if (tone) { try { tone.g.gain.setTargetAtTime(0, a.currentTime, 0.3); } catch (e) {} tone = null; }
  try { if (master) master.gain.cancelScheduledValues(a.currentTime); master.gain.setTargetAtTime(0, a.currentTime, 0.5); } catch (e) {}
  master = null;
  setTimeout(() => a.close().catch(() => {}), 2000);
}

/* ---------- おやすみモード ---------- */
let ses = null;
async function startNight() {
  const touch = db.prefs.senses.includes('touch');
  let vibOk = false;
  if (touch && CAN_VIBRATE) { try { vibOk = navigator.vibrate(60) !== false; } catch (e) {} } // タップ直後に呼ぶ（ブラウザの制約）
  // iPhoneでは傾きセンサーの利用に許可が必要
  try {
    if (window.DeviceOrientationEvent && DeviceOrientationEvent.requestPermission) await DeviceOrientationEvent.requestPermission();
  } catch (e) {}
  ses = {
    start: Date.now(), end: Date.now() + db.prefs.minutes * 60000,
    down: false, downSince: 0, downMs: 0, pickups: 0, sensor: false,
    touch, vibOk,
  };
  startSound(db.prefs.senses.includes('hearing') ? db.prefs.sound : 'none');
  if (touch && !vibOk) startTone();
  try { ses.lock = await navigator.wakeLock.request('screen'); } catch (e) {}
  window.addEventListener('deviceorientation', onTilt);
  const n = $('#night'); n.classList.remove('down', 'sunset', 'fading');
  const sight = db.prefs.senses.includes('sight');
  $('#sight-msg').hidden = !sight;
  n.hidden = false;
  if (sight) { // 暖色の灯りで始まり、3分かけて暗闇へ
    n.classList.add('sunset');
    ses.s1 = setTimeout(() => { n.classList.remove('sunset'); n.classList.add('fading'); }, 1500);
    ses.s2 = setTimeout(() => { n.classList.remove('fading'); $('#sight-msg').hidden = true; }, 182000);
  }
  breathe(); ses.tick = setInterval(tick, 1000); tick();
}
function onTilt(e) {
  if (!ses || e.beta == null) return;
  ses.sensor = true;
  const down = Math.abs(e.beta) > 150; // 画面が下向き
  if (down === ses.down) return;
  ses.down = down;
  if (down) ses.downSince = Date.now();
  else { ses.downMs += Date.now() - ses.downSince; ses.pickups++; }
  $('#night').classList.toggle('down', down);
}
function breathe() { // 4秒吸って、8秒吐く
  if (!ses) return;
  const orb = $('#orb');
  orb.classList.remove('out'); orb.classList.add('in'); $('#breath-text').textContent = '吸って';
  if (ses.vibOk) navigator.vibrate([350, 150, 350, 150, 350, 150, 350, 150, 350, 150, 350, 150, 350, 150, 350]); // 吸う4秒のあいだ、とくとくと振動
  toneBreath(true);
  ses.b1 = setTimeout(() => {
    orb.classList.add('out'); orb.classList.remove('in'); $('#breath-text').textContent = '吐いて'; toneBreath(false);
    ses.b2 = setTimeout(breathe, 8000);
  }, 4000);
}
function tick() {
  const left = ses.end - Date.now();
  if (left <= 0) return endNight(true);
  const m = Math.floor(left / 60000), s = Math.floor(left / 1000) % 60;
  $('#night-time').textContent = `あと ${m}:${String(s).padStart(2, '0')}`;
  $('#night-status').textContent = ses.down ? '伏せ置き中。そのまま、おやすみなさい'
    : ses.sensor ? 'スマホを伏せて置こう' : 'スマホを伏せて、目を閉じよう';
}
function endNight(completed) {
  if (!ses) return;
  clearInterval(ses.tick); clearTimeout(ses.b1); clearTimeout(ses.b2); clearTimeout(ses.s1); clearTimeout(ses.s2);
  $('#night').classList.remove('sunset', 'fading');
  window.removeEventListener('deviceorientation', onTilt);
  if (ses.vibOk) navigator.vibrate(0);
  if (ses.lock) ses.lock.release().catch(() => {});
  if (ses.down) ses.downMs += Date.now() - ses.downSince;
  stopSound();
  const mins = Math.round((Date.now() - ses.start) / 60000);
  const k = nightKey(new Date(ses.start));
  db.records[k] = Object.assign(db.records[k] || {}, {
    senses: [...db.prefs.senses], sound: db.prefs.sound,
    startedAt: new Date(ses.start).toTimeString().slice(0, 5),
    routineMin: mins, completed, faceDownMin: Math.round(ses.downMs / 60000),
    pickups: ses.pickups, sensor: ses.sensor,
  });
  save(); ses = null;
  $('#night').hidden = true; $('#orb').classList.remove('in', 'out');
  toast(completed ? 'ルーティン完了。おやすみなさい' : `${mins}分のルーティンを記録しました`);
  refreshDot();
}
$('#start-btn').addEventListener('click', startNight);
$('#stop-btn').addEventListener('click', () => endNight(false));
document.addEventListener('visibilitychange', async () => { // 画面復帰時に画面オン維持を取り直す
  if (ses && document.visibilityState === 'visible') { try { ses.lock = await navigator.wakeLock.request('screen'); } catch (e) {} }
});

/* ---------- 朝チェック ---------- */
let morning = {};
function renderMorning() {
  const k = nightKey(); const r = db.records[k] || {};
  morning = { onset: r.onset, fresh: r.fresh, phone: r.phone };
  $$('.scale').forEach((el) => {
    el.innerHTML = [1, 2, 3, 4, 5].map((n) => `<button data-v="${n}" class="${morning[el.dataset.key] === n ? 'on' : ''}">${n}</button>`).join('');
  });
  $$('#phone-seg button').forEach((b) => b.classList.toggle('on', b.dataset.v === morning.phone));
  const [, mo, da] = k.split('-');
  $('#morning-title').textContent = `${+mo}/${+da}の夜はどうだった？`;
  $('#morning-hint').textContent = r.senses ? `使った感覚：${r.senses.map(senseName).join('・')}` : 'ルーティンをしなかった夜も、記録しておくと比べられます。';
  $('#morning-save').textContent = score(r) ? '記録を更新する' : '記録する';
}
const senseName = (id) => (SENSES.find((s) => s.id === id) || {}).name || id;
$('#view-morning').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !b.dataset.v) return;
  const sc = b.closest('.scale');
  if (sc) morning[sc.dataset.key] = +b.dataset.v; else if (b.closest('#phone-seg')) morning.phone = b.dataset.v; else return;
  [...b.parentNode.children].forEach((c) => c.classList.toggle('on', c === b));
});
$('#morning-save').addEventListener('click', () => {
  if (!morning.onset || !morning.fresh || !morning.phone) return toast('3つとも選んでね');
  const k = nightKey();
  db.records[k] = Object.assign(db.records[k] || { senses: [] }, morning);
  save(); refreshDot(); toast('記録しました。今日もいい一日を'); show('review');
});

/* ---------- ふりかえり ---------- */
function renderReview() {
  const keys = Object.keys(db.records).sort();
  const scored = keys.filter((k) => score(db.records[k]));
  // 連続達成：スマホを触らなかった夜（少しだけ、も含めない）が何日続いているか
  let streak = 0; const d = new Date(nightKey() + 'T12:00');
  if (!db.records[fmt(d)] || !db.records[fmt(d)].phone) d.setDate(d.getDate() - 1); // 今夜分が未記録なら昨夜から数える
  while (db.records[fmt(d)] && db.records[fmt(d)].phone === 'no') { streak++; d.setDate(d.getDate() - 1); }
  $('#st-streak').textContent = streak;
  $('#st-nights').textContent = scored.length;
  $('#st-avg').textContent = scored.length ? (scored.reduce((a, k) => a + score(db.records[k]), 0) / scored.length).toFixed(1) : '–';

  const rows = SENSES.map((s) => {
    const v = scored.filter((k) => (db.records[k].senses || []).includes(s.id)).map((k) => score(db.records[k]));
    return { label: `${s.ico} ${s.name}`, n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  });
  const none = scored.filter((k) => !(db.records[k].senses || []).length).map((k) => score(db.records[k]));
  rows.push({ label: '何もなし', n: none.length, avg: none.length ? none.reduce((a, b) => a + b, 0) / none.length : null });
  const best = Math.max(...rows.filter((r) => r.n >= 2).map((r) => r.avg), 0);
  $('#chart-sense').innerHTML = scored.length ? rows.map((r) => `
    <div class="bar-row ${r.n >= 2 && r.avg === best ? 'best' : ''}">
      <span>${r.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${r.avg ? r.avg * 10 : 0}%"></div></div>
      <span class="val">${r.avg ? r.avg.toFixed(1) : '–'}<small> /${r.n}夜</small></span>
    </div>`).join('') : '<p class="empty">朝チェックを記録すると、ここに結果が出ます。</p>';

  let html = ''; const t = new Date(nightKey() + 'T12:00'); t.setDate(t.getDate() - 13);
  for (let i = 0; i < 14; i++, t.setDate(t.getDate() + 1)) {
    const r = db.records[fmt(t)]; const sc = score(r);
    html += `<div class="day" title="${fmt(t)}"><u>${r && r.phone === 'no' ? '●' : ''}</u><i class="${sc ? '' : 'none'}" style="height:${sc ? sc * 8 : 2}%"></i><s>${t.getDate()}</s></div>`;
  }
  $('#chart-days').innerHTML = `<div class="days">${html}</div>`;
}
$('#csv-btn').addEventListener('click', () => {
  const head = ['night', 'senses', 'sound', 'startedAt', 'routineMin', 'completed', 'faceDownMin', 'pickups', 'onset', 'fresh', 'score', 'phone'];
  const lines = Object.keys(db.records).sort().map((k) => {
    const r = db.records[k];
    return [k, (r.senses || []).join('+'), r.sound, r.startedAt, r.routineMin, r.completed, r.faceDownMin, r.pickups, r.onset, r.fresh, score(r), r.phone]
      .map((v) => (v == null ? '' : v)).join(',');
  });
  if (!lines.length) return toast('まだ記録がありません');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv' }));
  a.download = `gokan-${fmt(new Date())}.csv`; a.click();
});
$('#demo-btn').addEventListener('click', () => {
  const d = new Date(nightKey() + 'T12:00');
  for (let i = 1; i <= 14; i++) {
    d.setDate(d.getDate() - 1);
    if (db.records[fmt(d)]) continue;
    const senses = SENSES.filter(() => Math.random() < 0.4).map((s) => s.id);
    const boost = (senses.includes('smell') ? 1 : 0) + (senses.includes('hearing') ? 0.6 : 0) + senses.length * 0.2;
    const r5 = (x) => Math.max(1, Math.min(5, Math.round(x)));
    db.records[fmt(d)] = {
      demo: true, senses, sound: 'rain', startedAt: '23:10', routineMin: senses.length ? 30 : 0, completed: !!senses.length,
      faceDownMin: senses.length ? 25 : 0, pickups: 0,
      onset: r5(2 + boost + Math.random() * 1.5), fresh: r5(2 + boost + Math.random() * 1.5),
      phone: senses.length && Math.random() < 0.7 ? 'no' : Math.random() < 0.5 ? 'little' : 'yes',
    };
  }
  save(); renderReview(); toast('14日分のサンプルデータを入れました');
});
$('#clear-btn').addEventListener('click', () => {
  if (!$('#clear-btn').dataset.sure) {
    $('#clear-btn').dataset.sure = 1; $('#clear-btn').textContent = 'もう一度押すと消去';
    return setTimeout(() => { delete $('#clear-btn').dataset.sure; $('#clear-btn').textContent = '全消去'; }, 3000);
  }
  db.records = {}; save(); delete $('#clear-btn').dataset.sure; $('#clear-btn').textContent = '全消去';
  renderReview(); refreshDot(); toast('すべての記録を消去しました');
});

/* ---------- 画面切り替え ---------- */
const RENDER = { tonight: renderTonight, morning: renderMorning, review: renderReview };
function show(view) {
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  $$('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  RENDER[view](); window.scrollTo(0, 0);
}
function refreshDot() { // 朝チェックが未記録なら印をつける
  const h = new Date().getHours();
  $('#tabs [data-view="morning"]').classList.toggle('dot', h >= 4 && h < 12 && !score(db.records[nightKey()]));
}
$('#tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });

refreshDot();
const hour = new Date().getHours();
show(hour >= 4 && hour < 12 && !score(db.records[nightKey()]) ? 'morning' : 'tonight');

if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
