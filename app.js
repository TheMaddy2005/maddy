/* Maddy v3.2 - tuzha swatacha assistant. 100% client-side, no server. */
(function () {
  'use strict';

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var WAKE_RE = /(hey|he|hi|ok|okay)?\s*maddy/i;
  var CHIPS = [
    'Weather Pune',
    'Batmya sang',
    'Todo add kar: project complete',
    'Timer lav 5 min',
    'Motivation de',
    'Maddy, aaj konti tarikh?'
  ];
  var JOKES = [
    'Teacher: Maddy, tu class madhe zopli hotis? Maddy: Nahi sir, mi dole band karun concentrate karat hote!',
    'Wifi ani prem sarkhech asta - signal jawal astana sagla chhann chalta, dur gel ki connection cut!',
    'Programmer la vicharla: tu ratri ka jagto? To mhantoy: bugs la hi zopayacha asta ka mhanun!'
  ];
  var QUOTES = [
    'Rejections temporary ahet, tu permanent ahes. Aaj chi mehnat udyacha offer letter ahe. Chal, ajun ek chapter!',
    'Harat nahi mhanje jit. Pratyek "not selected" tula thoda ajun strong banavta. Pudhe chal, Maddy!',
    'Solapur hun Pune, Pune hun company - pravas haaluch pahu, pan thambu nako. Tu karu shaktes.',
    'English bolayala ghabru nako. Roz ek vakya bol - mahinyat farak disel.',
    'Lahan steps, motha result. Aaj fakt 25 min focused study - bas itka target.'
  ];
  var WMO = [
    [0, 'ekdam swachh akash'], [1, 'jawaljawal swachh'], [2, 'thode dagal'], [3, 'purna dagal'],
    [45, 'dhuke'], [48, 'dhuke'], [51, 'halka sar'], [53, 'sar'], [55, 'joadsar sar'],
    [61, 'halka paus'], [63, 'paus'], [65, 'jodar paus'], [66, 'gar paus'], [67, 'gar paus'],
    [71, 'himi varkh'], [73, 'himi varkh'], [75, 'jodar himi varkh'], [77, 'himi varkh'],
    [80, 'halkya sar'], [81, 'sar'], [82, 'jodar sar'], [85, 'himi sar'], [86, 'himi sar'],
    [95, 'vijanicha paus'], [96, 'gar-paus'], [99, 'gar-paus']
  ];

  var chat = document.getElementById('chat');
  var statusEl = document.getElementById('status');
  var input = document.getElementById('input');
  var ainote = document.getElementById('ainote');
  var micBtn = document.getElementById('mic');
  var wakeBtn = document.getElementById('wake');
  var listenLang = 'mr-IN';
  var wakeMode = false;
  var rec = null;
  var status = 'idle';

  var reminders = [];
  try { reminders = JSON.parse(localStorage.getItem('maddy-reminders.v1') || '[]'); } catch (e) { reminders = []; }
  var todos = [];
  try { todos = JSON.parse(localStorage.getItem('maddy-todos.v1') || '[]'); } catch (e) { todos = []; }
  var shopping = [];
  try { shopping = JSON.parse(localStorage.getItem('maddy-shopping.v1') || '[]'); } catch (e) { shopping = []; }
  var timers = [];

  function saveReminders() {
    try { localStorage.setItem('maddy-reminders.v1', JSON.stringify(reminders)); } catch (e) { /* private mode */ }
  }
  function saveTodos() {
    try { localStorage.setItem('maddy-todos.v1', JSON.stringify(todos)); } catch (e) { /* ignore */ }
  }
  function saveShopping() {
    try { localStorage.setItem('maddy-shopping.v1', JSON.stringify(shopping)); } catch (e) { /* ignore */ }
  }

  function detectLang(text) {
    if (/[ऀ-ॿ]/.test(text)) return 'mr-IN';
    if (/\b(ahe|ahet|kay|mala|tula|kasa|kashi|nahi|ho|kar|zala|bol|sang|majha|mazi|tuzha)\b/i.test(text)) return 'mr-IN';
    if (/\b(hai|kya|mera|meri|kaise|karo|bolo|batao)\b/i.test(text)) return 'hi-IN';
    return 'en-IN';
  }

  function pickVoice(lang) {
    try {
      var voices = window.speechSynthesis.getVoices();
      var prefs = lang === 'en-IN' ? ['en-IN', 'en'] : [lang, 'mr', 'hi', 'en-IN', 'en'];
      for (var i = 0; i < prefs.length; i++) {
        for (var j = 0; j < voices.length; j++) {
          if (voices[j].lang && voices[j].lang.toLowerCase().indexOf(prefs[i].toLowerCase()) === 0) return voices[j];
        }
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  function setStatus(s) {
    status = s;
    var map = {
      idle: wakeMode ? '"Hey Maddy" mode chalu - bol!' : 'Mic dab kiwa type kar',
      listening: 'Aikatay... bol ata',
      thinking: 'Vichar kartey...',
      speaking: 'Boltoy...'
    };
    statusEl.textContent = map[s];
    micBtn.classList.toggle('is-live', s === 'listening');
  }

  function bubble(who, text) {
    var d = document.createElement('div');
    d.className = 'bubble ' + who;
    d.textContent = text;
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  function bubbleLink(text, url, linkLabel) {
    var d = document.createElement('div');
    d.className = 'bubble maddy';
    var s = document.createElement('span');
    s.textContent = text + ' ';
    var a = document.createElement('a');
    a.href = url;
    a.textContent = linkLabel;
    a.target = '_blank';
    a.rel = 'noopener';
    d.appendChild(s);
    d.appendChild(a);
    chat.appendChild(d);
    chat.scrollTop = chat.scrollHeight;
  }

  function speakOnly(text, lang) {
    try {
      var useLang = lang || detectLang(text);
      var u = new SpeechSynthesisUtterance(text);
      u.lang = useLang;
      var v = pickVoice(useLang);
      if (v) u.voice = v;
      setStatus('speaking');
      u.onend = function () { setStatus('idle'); };
      u.onerror = function () { setStatus('idle'); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { setStatus('idle'); }
  }

  function say(text, lang) {
    bubble('maddy', text);
    try {
      var useLang = lang || detectLang(text);
      var u = new SpeechSynthesisUtterance(text);
      u.lang = useLang;
      var v = pickVoice(useLang);
      if (v) u.voice = v;
      setStatus('speaking');
      u.onend = function () { setStatus('idle'); };
      u.onerror = function () { setStatus('idle'); };
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { setStatus('idle'); }
  }

  function parseClockTime(t) {
    var m = t.match(/(\d{1,2})(?::(\d{1,2}))?\s*(am|pm|vajta|vajun)?/i);
    if (!m) return null;
    var h = parseInt(m[1], 10);
    var mins = m[2] ? parseInt(m[2], 10) : 0;
    if (h > 24 || mins > 59) return null;
    var mer = (m[3] || '').toLowerCase();
    if (mer === 'pm' && h < 12) h += 12;
    if (mer === 'am' && h === 12) h = 0;
    var d = new Date();
    d.setHours(h % 24, mins, 0, 0);
    if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  function fmtDateTime(ts) {
    return new Date(ts).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  function wmoText(code) {
    var best = 'baddal akash';
    for (var i = 0; i < WMO.length; i++) { if (WMO[i][0] <= code) best = WMO[i][1]; }
    return best;
  }

  function weatherFor(raw, lang) {
    var city = 'Pune';
    var m = raw.match(/(?:weather|havan|havaman|tapman|paus)\s+(?:che\s+|madhe\s+|at\s+|in\s+|of\s+)?([a-zA-Z\u0900-\u097F][a-zA-Z\u0900-\u097F ]{1,25})/i);
    if (m) {
      var cand = m[1].replace(/\s+(madhe|che|ahe|kay|kasa|kashi|sang|batav)$/i, '').trim();
      if (cand && !/^(aaj|aata|kay|che|madhe|sang)$/i.test(cand)) city = cand;
    }
    var m2 = raw.match(/([a-zA-Z\u0900-\u097F ]+)\s+(madhe|che)\s+(weather|havan|havaman|tapman)/i);
    if (m2) city = m2[1].trim();
    setStatus('thinking');
    fetch('https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(city) + '&count=1&language=mr&format=json')
      .then(function (r) { return r.json(); })
      .then(function (g) {
        if (!g || !g.results || !g.results.length) throw new Error('nocity');
        var c = g.results[0];
        return fetch('https://api.open-meteo.com/v1/forecast?latitude=' + c.latitude + '&longitude=' + c.longitude +
          '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto')
          .then(function (r) { return r.json(); })
          .then(function (w) { return { c: c, w: w }; });
      })
      .then(function (x) {
        var cur = x.w.current, d = x.w.daily;
        var msg = x.c.name + ' (' + (x.c.country || '') + '): aata ' + Math.round(cur.temperature_2m) + '°C, ' + wmoText(cur.weather_code) +
          '. Anubhav ' + Math.round(cur.apparent_temperature) + '°C, aardrata ' + cur.relative_humidity_2m + '%.' +
          ' Aaj max ' + Math.round(d.temperature_2m_max[0]) + '° / min ' + Math.round(d.temperature_2m_min[0]) +
          '°, paus chi shakyata ' + (d.precipitation_probability_max ? d.precipitation_probability_max[0] : 0) + '%.';
        say(msg, lang);
        setStatus('idle');
      })
      .catch(function () {
        say('Weather aata milala nahi - internet check kar kiwa thodya velane parat vichar.', lang);
        setStatus('idle');
      });
  }

  function news(lang) {
    setStatus('thinking');
    fetch('https://saurav.tech/NewsAPI/top-headlines/category/general/in.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var arts = (data.articles || []).filter(function (a) { return a && a.title; }).slice(0, 5);
        if (!arts.length) throw new Error('none');
        say('Aaj chya top batmya: ' + arts.map(function (a, i) { return (i + 1) + ') ' + a.title; }).join(' '), lang);
        setStatus('idle');
      })
      .catch(function () {
        say('Batmya aata milalya nahi - internet check kar kiwa thodya velane parat vichar.', lang);
        setStatus('idle');
      });
  }

  function aiAnswer(q) {
    setStatus('thinking');
    var prompt = 'You are Maddy, a warm personal voice assistant. Answer in the same language the question is written in (Marathi, Hindi or English). Keep the answer short, under 60 words, friendly. Question: ' + q;
    var ctrl = new AbortController();
    var to = setTimeout(function () { ctrl.abort(); }, 20000);
    fetch('https://text.pollinations.ai/' + encodeURIComponent(prompt), { signal: ctrl.signal })
      .then(function (res) {
        clearTimeout(to);
        if (!res.ok) throw new Error('api');
        return res.text();
      })
      .then(function (text) {
        ainote.hidden = false;
        say((text || '').trim() || 'Sorry, answer milala nahi. Parat vichar.');
        setStatus('idle');
      })
      .catch(function () {
        say('AI jawab aata milala nahi - internet check kar kiwa thodya velane parat vichar. Baki sagla offline chalta.');
        setStatus('idle');
      });
  }

  function handle(rawInput) {
    var raw = (rawInput || '').trim();
    if (!raw) return;
    bubble('tu', raw);
    var t = raw.toLowerCase().replace(WAKE_RE, '').trim() || raw.toLowerCase();
    var lang = detectLang(raw);

    if (/timer|टायमर/.test(t) && !/study|abhyas|pomodoro/.test(t)) {
      var m = t.match(/(\d+)\s*(sec|second|min|mint|minute|hour|hr|tas)?/);
      var n = m ? parseInt(m[1], 10) : 1;
      var unit = m && m[2] ? m[2] : 'min';
      var ms = /sec/.test(unit) ? n * 1000 : /hour|hr|tas/.test(unit) ? n * 3600000 : n * 60000;
      timers.push({ id: 't' + Date.now(), label: n + ' ' + unit, endsAt: Date.now() + ms });
      renderChalu();
      say('Timer laavla: ' + n + ' ' + unit + '.', lang);
      return;
    }
    if (/(study|abhyas|pomodoro)/.test(t) && /(timer|suru|start|session|pomodoro)/.test(t)) {
      timers.push({ id: 't' + Date.now(), label: 'Study 25 min', endsAt: Date.now() + 25 * 60000 });
      renderChalu();
      say('Study timer 25 min laavla - phone bajula, focus study var! Timer zali ki mi sangen.', lang);
      return;
    }
    if (/alarm|अलार्म/.test(t)) {
      var atA = parseClockTime(t);
      if (atA) {
        timers.push({ id: 'a' + Date.now(), label: 'Alarm ' + fmtTime(atA), endsAt: atA });
        renderChalu();
        say('Alarm set: ' + fmtTime(atA) + ' la. App ughada thev.', lang);
      } else say('Kontya veli alarm? Jaise "alarm sakali 7 vajta".', lang);
      return;
    }
    if (/remind|athavan|athvan|remider|आठवण/.test(t) && !/(mazya|majya|list|dakhav|dakav|dikha)/.test(t)) {
      var at = parseClockTime(t);
      var text = raw.replace(/^(hey |he )?maddy[,.]?/i, '')
        .replace(/mala |malaa |please |plz /gi, '')
        .replace(/athavan karun de|athvan karun de|remind me|reminder|आठवण करून दे/gi, '')
        .replace(/aaj |aj /i, '')
        .replace(/\d{1,2}(:\d{1,2})?\s*(am|pm|vajta|vajun)?/i, '')
        .replace(/\s+/g, ' ').trim() || 'Reminder';
      if (at) {
        reminders.push({ id: 'r' + Date.now(), text: text, at: at });
        saveReminders();
        renderChalu();
        renderCal();
        say('Thevla! ' + fmtDateTime(at) + ' la athavan karun dein: "' + text + '"', lang);
      } else say('Kadhi athavan karun deu? Jaise "athavan karun de aaj 9 vajta study".', lang);
      return;
    }
    if (/reminders|athavani|athavn/.test(t) && /(mazya|majya|list|dakhav|dakav|dikha|sang)/.test(t)) {
      var act = reminders.filter(function (r) { return !r.done; });
      say(act.length
        ? 'Tuzya ' + act.length + ' reminders ahet: ' + act.map(function (r) { return r.text + ' (' + fmtTime(r.at) + ')'; }).join('; ')
        : 'Aata kahi reminders nahit.', lang);
      return;
    }

    // To-do list
    if (/(todo|to-do|task|kama|kam list)/.test(t) && /(add|tak|ghaal|navin)/.test(t)) {
      var item = raw.replace(/^(hey |he )?maddy[,.]?/i, '')
        .replace(/todo|to-do|task|kam|kama|add|tak|ghaal|navin|list|madhe|mala|karun de|kar/gi, '')
        .replace(/^[:\-\s]+/, '').replace(/\s+/g, ' ').trim();
      if (item) {
        todos.push({ id: 'td' + Date.now(), text: item, done: false });
        saveTodos();
        renderChalu();
        say('Todo madhe takla: "' + item + '". Ekun ' + todos.filter(function (x) { return !x.done; }).length + ' kama ureglit.', lang);
      } else say('Kay add karu? Jaise "todo add kar: resume update".', lang);
      return;
    }
    if (/(todo|to-do|tasks?|kama)/.test(t) && /(dakhav|dakav|list|mazya|majya|sang|kay ahe)/.test(t)) {
      var open = todos.filter(function (x) { return !x.done; });
      say(open.length
        ? 'Tuzya todo list: ' + open.map(function (x, i) { return (i + 1) + ') ' + x.text; }).join('; ')
        : 'Todo list rickami ahe. "todo add kar: ..." mhanun navin tak.', lang);
      return;
    }
    if (/(purna|zala|zali|done|complete|kela|keli)/.test(t) && /(todo|kam|task|\d)/.test(t) && !/timer|alarm/.test(t)) {
      var openT = todos.filter(function (x) { return !x.done; });
      var hit = null;
      var numM = t.match(/(\d+)/);
      if (numM && openT[parseInt(numM[1], 10) - 1]) hit = openT[parseInt(numM[1], 10) - 1];
      if (!hit) {
        var probe = t.replace(/purna|zala|zali|done|complete|kela|keli|todo|kam|task|maze|majhe|maza|mazi|\d+/g, '').trim();
        if (probe) {
          for (var ti = 0; ti < openT.length; ti++) {
            if (openT[ti].text.toLowerCase().indexOf(probe) !== -1) { hit = openT[ti]; break; }
          }
        }
      }
      if (hit) {
        hit.done = true;
        saveTodos();
        renderChalu();
        say('Shabash! "' + hit.text + '" purna zala. Ureglit: ' + todos.filter(function (x) { return !x.done; }).length + '.', lang);
      } else say('Konte kam purna zale? "mazya todo dakav" mhanun number bagh, mag "todo 1 done".', lang);
      return;
    }

    // Shopping list (free local version)
    if (/shopping|kharedi/.test(t) && /(list|dakhav|dakav|sang)/.test(t) && !/add|tak|ghaal/.test(t)) {
      var openS = shopping.filter(function (x) { return !x.done; });
      say(openS.length
        ? 'Shopping list: ' + openS.map(function (x, i) { return (i + 1) + ') ' + x.text; }).join('; ')
        : 'Shopping list rickami ahe. "shopping madhe tak: ..." mhanun add kar.', lang);
      return;
    }
    if (/(shopping|kharedi)/.test(t) && /(add|tak|ghaal)/.test(t)) {
      var sItem = raw.replace(/^(hey |he )?maddy[,.]?/i, '')
        .replace(/shopping|kharedi|list|madhe|add|tak|ghaal|mala|karun de|kar/gi, '')
        .replace(/^[:\-\s]+/, '').replace(/\s+/g, ' ').trim();
      if (sItem) {
        shopping.push({ id: 'sh' + Date.now(), text: sItem, done: false });
        saveShopping();
        say('Shopping list madhe takla: "' + sItem + '".', lang);
      } else say('Kay gheychay? Jaise "shopping madhe tak: dudh".', lang);
      return;
    }
    if (/(shopping|kharedi)/.test(t) && /(purna|zala|zali|done|ghetla|ghetli)/.test(t)) {
      var probeS = t.replace(/shopping|kharedi|list|madhe|purna|zala|zali|done|ghetla|ghetli/g, '').trim();
      var openS2 = shopping.filter(function (x) { return !x.done; });
      var hitS = null;
      for (var si = 0; si < openS2.length; si++) {
        if (probeS && openS2[si].text.toLowerCase().indexOf(probeS) !== -1) { hitS = openS2[si]; break; }
      }
      if (hitS) {
        hitS.done = true;
        saveShopping();
        say('"' + hitS.text + '" ghetla - list madhun kadhla.', lang);
      } else say('Kay ghetlas? "shopping list dakav" mhanun bagh.', lang);
      return;
    }

    // Weather
    if (/(weather|havan|havaman|tapman|temperature|paus)/.test(t) && !/remind|athavan/.test(t)) {
      weatherFor(raw, lang);
      return;
    }
    // News
    if (/(batmya|batmi|news|headline|khabar|samachar)/.test(t)) {
      news(lang);
      return;
    }
    // Calls / messages (free honest version: opens the phone's own apps)
    if (/(call|dial|phone kar|फोन)/.test(t)) {
      var numM2 = raw.match(/(\+?\d[\d\s\-()]{6,16}\d)/);
      if (numM2) {
        var num = numM2[1].replace(/[\s\-()]/g, '');
        bubbleLink(num + ' var call karnyasathi he daba:', 'tel:' + num, 'Call ' + num);
        speakOnly('Call button tayar ahe - dab ki tuzya phone cha dialer ughdel.', lang);
      } else {
        say('Konala call karaycha? Number sang - "call 98XXXXXXXX". Mi call button banavte, tu dab ki phone app ughadta. Swataha call karu shakat nahi - te phakt tuzya hatat ahe.', lang);
      }
      return;
    }
    if (/(sms|message|messege|mesej)/.test(t) && !/whatsapp/.test(t)) {
      var numM3 = raw.match(/(\+?\d[\d\s\-()]{6,16}\d)/);
      if (numM3) {
        var num3 = numM3[1].replace(/[\s\-()]/g, '');
        bubbleLink(num3 + ' la SMS karnyasathi he daba:', 'sms:' + num3, 'SMS ' + num3);
        speakOnly('SMS button tayar ahe - dab ki messaging app ughdel.', lang);
      } else {
        say('Konala SMS? Number sang - "sms 98XXXXXXXX". Mi SMS button banavte - tu dab ki tuzya phone cha messaging app ughadta.', lang);
      }
      return;
    }
    // Smart home (honest: needs hardware)
    if (/(smart home|light|batam|bulb|fan chalu|fan band|tubelight|ac chalu|ac band)/.test(t)) {
      say('Smart home control sathi hardware lagto - Alexa Echo kiwa smart bulb/plug (Google Home). Te free nahi, mhanun app madhe te add kele nahi. Paise jama zale ki smart bulb ghe - mag phone pasun light/fan chalavta yetil!', lang);
      return;
    }
    // Skills
    if (/(skills?|skill list)/.test(t)) {
      say('Mazya skills: jokes ("joke sang"), motivation ("motivation de"), study timer 25 min ("study timer suru kar"), weather, batmya, reminders, todo, shopping list, music, prashna-uttar. Roz navin add hoteil!', lang);
      return;
    }
    if (/(motivation|himmat|hosla|inspire|quote|utsah)/.test(t)) {
      say(QUOTES[Math.floor(Math.random() * QUOTES.length)], lang);
      return;
    }
    if (/help|madad|kay karu shaktes|kay karte|features/.test(t)) {
      say('Mi he sagla karte: 1) voice bolne-aikne, "Hey Maddy" mode 2) gaani/podcast (YouTube) 3) alarm, timer, reminder, to-do 4) weather, batmya, prashna-uttar 5) call/SMS buttons 6) shopping list 7) skills - jokes, motivation, study timer. Bol kiwa type kar!', lang);
      return;
    }
    if (/tarikh|taarikh|date|आज कोंती|aaj kay|aaj konti/.test(t) && !/play|gaan/.test(t)) {
      var d = new Date();
      say('Aaj ' + d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ' ahe.', lang);
      return;
    }
    if (/kiti vajle|time kay|vel kay|what time|वेळ/.test(t)) {
      say('Aata ' + fmtTime(Date.now()) + ' vajle ahet.', lang);
      return;
    }
    if (/podcast/.test(t)) {
      var pq = raw.replace(/^(hey |he )?maddy[,.]?/i, '').replace(/podcast|play|vajav|sang|mala|aikaycha|aiku/gi, '').replace(/\s+/g, ' ').trim();
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent((pq ? pq + ' ' : '') + 'podcast marathi'), '_blank');
      say('YouTube var podcast ughadla - navin tab bagh!', lang);
      return;
    }
    if (/play|gaan|gane|song|music|lav|वाजव/.test(t) && !/timer/.test(t)) {
      var q = raw.replace(/^(hey |he )?maddy[,.]?/i, '')
        .replace(/play|vajav|वाजव|gaan|gane|song|music|karun de|kar|mala|please/gi, '')
        .replace(/\s+/g, ' ').trim();
      window.open('https://www.youtube.com/results?search_query=' + encodeURIComponent(q || 'marathi songs'), '_blank');
      say('YouTube var "' + (q || 'songs') + '" ughadla - navin tab bagh!', lang);
      return;
    }
    if (/calendar|calender|dindarshika/.test(t)) {
      say('Aaj ' + new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }) + ' ahe. Khali mini calendar ahe - tuzya reminders tyat dishtil.', lang);
      return;
    }
    if (/joke|vinod|hasav/.test(t)) {
      say(JOKES[Math.floor(Math.random() * JOKES.length)], lang);
      return;
    }
    if (/tu kon|who are you|tuz nav|tuzha nav|about/.test(t)) {
      say('Mi Maddy - tuzha swatacha voice assistant. Reminders, timer, todo, weather, batmya, gaani ani prashnanchi uttar dete. Free, offline-first, server nahi!', lang);
      return;
    }
    if (/^(hi|hello|hey|namaskar|namaste|kay boltes|kay chalu)\b/.test(t)) {
      say('Namaskar! Bol, kay madat karu? Timer, reminder, weather, batmya, gaana ki prashna - kahihi vichar.', lang);
      return;
    }
    aiAnswer(raw);
  }

  function startRecognition(continuous) {
    if (!SR) { say('Ya browser madhe voice recognition nahi - khali type kar, sarv features tithech chaltat.'); return; }
    try { if (rec) rec.stop(); } catch (e) { /* ignore */ }
    rec = new SR();
    rec.lang = listenLang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = continuous;
    setStatus('listening');
    rec.onresult = function (e) {
      var last = e.results[e.results.length - 1];
      if (!last.isFinal) return;
      var text = last[0].transcript;
      if (continuous) {
        if (WAKE_RE.test(text)) {
          var cmd = text.replace(WAKE_RE, '').trim();
          if (cmd) handle(cmd); else say('Hm, bol Maddy - aikatay.');
        }
      } else {
        handle(text.replace(WAKE_RE, '').trim() || text);
      }
    };
    rec.onerror = function (ev) {
      setStatus('idle');
      if (ev && (ev.error === 'not-allowed' || ev.error === 'service-not-allowed')) {
        say('Mic permission milali nahi - browser settings madhe ya site sathi mic allow kar. Topariant type kar.');
      } else if (!continuous) {
        say('Aikla nahi - parat mic dabun bol, kiwa type kar.');
      }
    };
    rec.onend = function () {
      if (status === 'listening') setStatus('idle');
      if (continuous && wakeMode) {
        try { rec.start(); setStatus('listening'); } catch (e) { /* ignore */ }
      }
    };
    try { rec.start(); } catch (e) { /* ignore */ }
  }

  micBtn.addEventListener('click', function () { startRecognition(false); });
  wakeBtn.addEventListener('click', function () {
    wakeMode = !wakeMode;
    wakeBtn.textContent = '"Hey Maddy" mode: ' + (wakeMode ? 'ON' : 'OFF');
    wakeBtn.classList.toggle('is-on', wakeMode);
    if (wakeMode) {
      startRecognition(true);
      bubble('maddy', '"Hey Maddy" mode ON. App ughada thev - bol "Hey Maddy" ani mag tujha command.');
    } else {
      try { if (rec) rec.stop(); } catch (e) { /* ignore */ }
      setStatus('idle');
    }
  });

  Array.prototype.forEach.call(document.querySelectorAll('.lang'), function (b) {
    b.addEventListener('click', function () {
      listenLang = b.getAttribute('data-lang');
      Array.prototype.forEach.call(document.querySelectorAll('.lang'), function (x) { x.classList.toggle('is-sel', x === b); });
    });
  });

  var chipsEl = document.getElementById('chips');
  CHIPS.forEach(function (c) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = c;
    b.addEventListener('click', function () { handle(c); });
    chipsEl.appendChild(b);
  });

  function submit() {
    var v = input.value;
    input.value = '';
    handle(v);
  }
  document.getElementById('send').addEventListener('click', submit);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

  function renderChalu() {
    var ul = document.getElementById('chalu');
    var group = document.getElementById('chalu-group');
    ul.innerHTML = '';
    var now = Date.now();
    var activeT = timers.filter(function (x) { return !x.done; });
    var activeR = reminders.filter(function (r) { return !r.done; }).sort(function (a, b) { return a.at - b.at; });
    var openTodo = todos.filter(function (x) { return !x.done; });
    group.hidden = activeT.length + activeR.length + openTodo.length === 0;
    activeT.forEach(function (x) {
      var left = Math.max(0, Math.round((x.endsAt - now) / 1000));
      var mm = Math.floor(left / 60), ss = left % 60;
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.innerHTML = '<strong></strong><small>Timer / alarm chalu</small>';
      span.querySelector('strong').textContent = x.label;
      var v = document.createElement('span');
      v.className = 'v';
      v.textContent = mm + ':' + String(ss).padStart(2, '0');
      li.appendChild(span); li.appendChild(v);
      ul.appendChild(li);
    });
    activeR.forEach(function (r) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.innerHTML = '<strong></strong><small></small>';
      span.querySelector('strong').textContent = r.text;
      span.querySelector('small').textContent = fmtDateTime(r.at);
      var v = document.createElement('span');
      v.className = 'v';
      v.textContent = 'Reminder';
      li.appendChild(span); li.appendChild(v);
      ul.appendChild(li);
    });
    openTodo.forEach(function (x, i) {
      var li = document.createElement('li');
      var span = document.createElement('span');
      span.innerHTML = '<strong></strong><small>To-do - "todo ' + (i + 1) + ' done" mhanun purna kar</small>';
      span.querySelector('strong').textContent = (i + 1) + '. ' + x.text;
      var v = document.createElement('span');
      v.className = 'v';
      v.textContent = 'To-do';
      li.appendChild(span); li.appendChild(v);
      ul.appendChild(li);
    });
  }

  function renderCal() {
    var cal = document.getElementById('cal');
    var d = new Date();
    var y = d.getFullYear(), mo = d.getMonth();
    document.getElementById('cal-title').textContent = d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    var first = new Date(y, mo, 1).getDay();
    var days = new Date(y, mo + 1, 0).getDate();
    var remDays = {};
    reminders.forEach(function (r) {
      if (!r.done) { var rd = new Date(r.at); if (rd.getFullYear() === y && rd.getMonth() === mo) remDays[rd.getDate()] = true; }
    });
    cal.innerHTML = '';
    ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(function (h) {
      var s = document.createElement('span'); s.className = 'h'; s.textContent = h; cal.appendChild(s);
    });
    for (var i = 0; i < first; i++) { var e0 = document.createElement('span'); cal.appendChild(e0); }
    for (var day = 1; day <= days; day++) {
      var s2 = document.createElement('span');
      s2.className = 'd' + (day === d.getDate() ? ' today' : '') + (remDays[day] ? ' hasrem' : '');
      s2.textContent = day;
      cal.appendChild(s2);
    }
  }

  // Fire timers + reminders every second
  setInterval(function () {
    var now = Date.now();
    var dueT = timers.filter(function (x) { return !x.done && x.endsAt <= now; });
    if (dueT.length) {
      dueT.forEach(function (x) { x.done = true; });
      renderChalu();
      say(dueT.some(function (x) { return x.label.indexOf('Alarm') === 0; }) ? 'Alarm! Velel zala - uth Maddy!' : 'Timer zala! (' + dueT[0].label + ')');
    }
    var dueR = reminders.filter(function (r) { return !r.done && r.at <= now; });
    if (dueR.length) {
      dueR.forEach(function (r) { r.done = true; });
      saveReminders();
      renderChalu();
      renderCal();
      say('Athavan: ' + dueR.map(function (r) { return r.text; }).join('; '));
    }
    // live countdown
    if (timers.some(function (x) { return !x.done; })) renderChalu();
  }, 1000);

  // Voices load async in Chrome
  try { window.speechSynthesis.getVoices(); window.speechSynthesis.onvoiceschanged = function () { window.speechSynthesis.getVoices(); }; } catch (e) { /* ignore */ }

  // Service worker (offline)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () { /* file:// or blocked */ });
  }

  // Init
  bubble('maddy', 'Namaskar! Mi Maddy - tuzha swatacha assistant. Mic dabun bol kiwa type kar - timer, reminder, todo, weather, batmya, gaana, prashna, kahihi!');
  renderChalu();
  renderCal();
})();
