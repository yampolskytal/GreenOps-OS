'use strict';
const $ = id => document.getElementById(id);
const fmt = (n, digits = 1) => n == null ? '—' : new Intl.NumberFormat('en-CH', {maximumFractionDigits: digits}).format(n);
const percent = n => n == null ? '—' : fmt(n * 100) + '%';
const range = a => fmt(a[0]) + '–' + fmt(a[2]);
let baseline, request = 0;
let questionContext = {};
const dataButtons = () => [...document.querySelectorAll('[data-view]')];

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function get(view) {
  const result = await fetch('/api/' + view);
  if (!result.ok) throw new Error('Could not load ' + view);
  return result.json();
}
async function post(view,payload) {
  const response = await fetch('/api/' + view,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function table(headers, rows) {
  const wrap = el('div', null, 'table-scroll');
  const tab = el('table');
  const head = tab.createTHead().insertRow();
  headers.forEach(h => {
    const th = el('th', h);
    th.scope = 'col';
    head.append(th);
  });
  const body = tab.createTBody();
  rows.forEach(cells => {
    const row = body.insertRow();
    cells.forEach(cell => {
      const td = row.insertCell();
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell;
    });
  });
  wrap.append(tab);
  return wrap;
}
function detail(label, data) {
  const node = el('details');
  node.append(el('summary', label));
  node.addEventListener('toggle', () => {
    if (node.open && !node.querySelector('pre')) node.append(el('pre', JSON.stringify(data, null, 2)));
  });
  return node;
}
function link(label, url) {
  const node = el('a', label, 'button');
  node.href = url;
  return node;
}
function drivers(root, data) {
  const label = el('label', 'Group by');
  const select = el('select');
  const fields = {categories:'Category', departments:'Department', tools:'Tool', months:'Month', regions:'Hosting region', projects:'Project', providers:'Provider'};
  Object.entries(fields).forEach(([k, name]) => {
    const option = el('option', name);
    option.value = k;
    select.append(option);
  });
  label.append(select);
  const rank = selectField('rank','Rank by',[['chf','Cost'],['kwh','Energy'],['kg','Location CO₂e']]);
  const rankSelect = rank.querySelector('select');
  const target = el('div');
  const draw = () => {
    const rows = data[select.value];
    const value = r => rankSelect.value === 'chf' ? r.chf : r[rankSelect.value][1];
    const cap = Math.max(1, ...rows.map(value));
    const display = [...rows].sort((a,b) => select.value === 'months' ? a.name.localeCompare(b.name) :
      value(b) - value(a) || a.name.localeCompare(b.name));
    target.replaceChildren(table(['Group','Cost (CHF)','Energy (kWh)','Location CO₂e (kg)','Energy gaps'], display.map(r => {
      const cost = el('div', fmt(r.chf, 2));
      const bar = el('progress', null, 'bar');
      bar.max = cap;
      bar.value = Math.max(0, value(r));
      bar.setAttribute('aria-label', 'Value relative to the highest group');
      const energy = el('div', fmt(r.kwh[1]));
      const carbon = el('div', fmt(r.kg[1]));
      ({chf:cost,kwh:energy,kg:carbon})[rankSelect.value].append(bar);
      const name = select.value === 'categories' && r.name === 'Servers' ? 'Server telemetry (supplementary energy)' : r.name;
      return [name || 'Unallocated', cost, energy, carbon, fmt(r.missing_energy,0)];
    })));
  };
  select.addEventListener('change', draw);
  rankSelect.addEventListener('change', draw);
  const controls=el('div',null,'controls');
  controls.append(label,rank);
  root.append(el('h2','Baseline drivers'), controls, target);
  draw();
}
function packageView(root, p) {
  const form = el('form', null, 'controls');
  const fields = [['budget','Budget (CHF)',16500,p.budget_chf], ['days','Person-days',15,p.day_limit]];
  for (const [name, caption, max, value] of fields) {
    const label = el('label', caption + ' ');
    const input = el('input');
    Object.assign(input, {name, type:'number', min:0, max, value, step:name==='days'?.5:1, required:true});
    label.append(input);
    form.append(label);
  }
  form.append(selectField('mode','Review status', [['planning','Eligible planning'],['approved','Owner-approved only'],['conditional','Conditional draft']],p.mode),
    selectField('objective','Objective',[['midpoint','Midpoint targets'],['conservative','Conservative carbon'],['first-year','First-year CHF']],p.objective));
  const action = el('button','Run optimizer');
  action.type = 'submit';
  form.append(action);
  const result = el('div');
  const error = el('p');
  const downloads = el('div',null,'controls');
  root.append(el('h2','Measures package'), form, error, downloads, result);
  function update(plan){
    p=plan;
    const query = new URLSearchParams({days:p.day_limit,budget:p.budget_chf,mode:p.mode,objective:p.objective});
    if(p.mode==='conditional') query.set('draft','1');
    downloads.replaceChildren(link(p.mode==='conditional'?'Download draft CSV':'Download this scenario CSV',
      '/downloads/template_measures_package.csv?' + query));
    result.replaceChildren();
    drawPackage(result,p);
  }
  update(p);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    action.disabled = true;
    error.textContent = '';
    try {
      const plan = await get('package?' + new URLSearchParams(new FormData(form)));
      update(plan);
    } catch (e) {
      error.textContent = e.message;
    } finally {
      action.disabled = false;
    }
  });
  get('settings').then(config=>{
    if(config.role==='viewer') return;
    const save = el('form',null,'controls');
    const label=el('label','Scenario name ');
    const name=el('input');name.required=true;name.maxLength=100;label.append(name);
    save.append(label,el('button','Save scenario'));
    const comparison=el('div');
    root.append(save,comparison);
    async function compare(){
      const saved=await get('scenarios');
      comparison.replaceChildren(table(['Saved scenario','Mode','Days','Annual CHF saved','Location CO₂e savings'],saved.map(s=>{
        const a=s.payload.result;
        return [s.payload.name,a.mode,a.days,fmt(a.savings.chf),percent(a.carbon_fraction)];
      })));
    }
    save.addEventListener('submit',async e=>{
      e.preventDefault();
      try{
        await post('scenarios',{run:config.run,name:name.value,budget:p.budget_chf,days:p.day_limit,mode:p.mode,objective:p.objective});
        await compare(); name.value='';
      }catch(e){error.textContent=e.message;}
    });
    compare().catch(e=>error.textContent=e.message);
    if(config.role==='admin'||config.role==='reviewer') root.append(reviewForm(config,()=>form.requestSubmit()));
  }).catch(e=>error.textContent=e.message);
}
function selectField(name, caption, options, value) {
  const label=el('label',caption+' ');
  const menu=el('select');menu.name=name;
  options.forEach(([id,title])=>{const option=el('option',title);option.value=id;menu.append(option);});
  if(value) menu.value=value;
  label.append(menu);return label;
}
function reviewForm(config, refresh){
  const box=el('details');box.append(el('summary','Record an owner review'));
  const result=el('p');
  get('package').then(data=>{
    const measures=[...data.selected,...data.excluded];
    const form=el('form');
    const choice=selectField('measure','Measure',measures.map(m=>[m.id,m.id]));
    const decision=selectField('decision','Decision',[['rejected','Reject'],['approved','Approve']]);
    const label=el('label','Evidence reference and decision rationale');
    const evidence=el('textarea');evidence.required=true;evidence.maxLength=2000;evidence.rows=3;
    label.append(evidence);
    const checks={owner_attested:'Owner approval verified',protection_checked:'Protection windows verified',
      dependency_checked:'Dependencies verified',rollback_tested:'Rollback tested'};
    form.append(choice,decision,label);
    for(const [id,caption] of Object.entries(checks)){
      const line=el('label');const field=el('input');field.type='checkbox';field.name=id;line.append(field,caption);
      form.append(line);
    }
    form.append(el('button','Record decision'),result);
    form.addEventListener('submit',async event=>{
      event.preventDefault();const fields=new FormData(form);
      const item=measures.find(m=>m.id===fields.get('measure'));
      if(!item) return;
      try{
        await post('review',{run:config.run,measure:item.id,fingerprint:item.review_fingerprint,
          evidence:evidence.value,decision:fields.get('decision'),...Object.fromEntries(Object.keys(checks).map(k=>[k,fields.has(k)]))});
        result.textContent='Decision saved.';refresh();
      }catch(e){result.textContent=e.message;}
    });
    box.append(form);
  }).catch(e=>{result.textContent=e.message;box.append(result);});
  return box;
}
function drawPackage(root, p) {
  root.append(
    el('p',p.mode==='conditional'?'Draft scenario. Selected activities may still need owner evidence or a pilot.':
      p.mode==='approved'?'Only measures with recorded owner evidence are eligible.':'Planning estimates, subject to owner sign-off.',
      p.mode==='conditional'?'callout warning':'muted'),
    el('p', (p.target_met ? 'Both midpoint targets reached' : 'Target shortfall: CHF ' + fmt(p.cost_gap_chf) + ' and ' + fmt(p.carbon_gap_kg) + ' kg CO₂e') +
      ' · ' + percent(p.cost_fraction) + ' cost savings / 25% target · ' + percent(p.carbon_fraction) + ' carbon savings / 40% target',
      p.target_met ? 'callout' : 'callout warning'),
    el('p', fmt(p.days) + ' / ' + p.day_limit + ' person-days · CHF ' + fmt(p.spent_chf) + ' / ' + fmt(p.budget_chf) +
        ' · Conservative carbon sensitivity ' + percent(p.conservative_carbon_fraction)),
    el('p','Annual run-rate savings CHF ' + fmt(p.savings.chf) + ' · First-year gross CHF ' + fmt(p.first_year_chf) +
      ' · First-year net after implementation CHF ' + fmt(p.first_year_net_chf)),
    el('p', p.method + (p.optimum_proven ? ' Search completed.' : ' Search limit reached. Best package found so far.'), 'muted'));
  const rows = [...p.selected, ...p.excluded];
  root.append(detail('Savings timing and licence renewals',p.savings_timing));
  const alternatives = el('div');
  root.append(alternatives);
  const params = new URLSearchParams({budget:p.budget_chf,days:p.day_limit,mode:p.mode,objective:p.objective});
  get('investment-options?' + params).then(options=>alternatives.replaceChildren(detail('Alternative cost measures and break-even quotes',options)))
    .catch(error=>alternatives.textContent=error.message);
  if (p.mode === 'planning') root.append(whatIf(p, rows));
  const picked = new Set(p.selected.map(m=>m.id));
  root.append(table(['Measure', 'Scope', 'In package', 'Status', 'Days', 'Annual CHF', 'Annual CO₂e kg'], rows.map(m =>
    [m.name, m.resource, picked.has(m.id) ? 'Yes' : '—', m.status === 'blocked' ? 'Blocked' : m.requires_approval ? 'Needs a human decision' : 'OK',
      fmt(m.days), fmt(m.chf), fmt(m.kg[1])])));
  rows.forEach(m => {
    const entry = detail(m.name + ' · ' + m.resource, {method:m.method, change:m.change, approval:m.approval, blockers:m.blockers,
      selected:p.selected.some(s=>s.id===m.id), modeled_annual_kwh:m.kwh, modeled_annual_kg:m.kg,
      protection:m.protection, review:p.reviews[m.id], evidence:m.evidence.slice(0,8), evidence_count:m.evidence.length});
    entry.append(link('Open complete calculation','/api/measures/'+encodeURIComponent(m.id)+'/explain'));
    root.append(entry);
  });
}
function whatIf(p, rows) {
  const section = el('details');
  section.append(el('summary','Compare a quote or exclude a measure'));
  const form = el('form',null,'controls');
  const exclusion = selectField('excluded','Exclude',[['','None'],...p.selected.map(m=>[m.id,m.name])]);
  form.append(exclusion);
  const hasProduction = rows.some(m=>m.id==='Negotiate production compute rate:dp-prod') &&
    rows.some(m=>m.id==='Autoscale surplus production workers:dp-prod');
  const quote = el('input');quote.type='number';quote.min=0;quote.step=.01;
  if (hasProduction) {
    const label=el('label','Hypothetical production quote (CHF/year) ');
    label.append(quote);
    form.append(label);
  }
  const action = el('button','Compare');
  const results = el('div');results.setAttribute('aria-live','polite');
  form.append(action);
  section.append(el('p','The quote applies to the current annual volume at a variable rate. This preview leaves the saved package and approvals unchanged.'),form,results);
  form.addEventListener('submit',async event=>{
    event.preventDefault();
    action.disabled=true;
    try {
      const excluded=exclusion.querySelector('select').value;
      const c=await post('package/compare',{budget:p.budget_chf,days:p.day_limit,objective:p.objective,
        exclude:excluded?[excluded]:[],production_annual_quote_chf:quote.value===''?null:Number(quote.value)});
      results.replaceChildren(table(['Package','Annual savings CHF','CO₂e savings','CHF gap','CO₂e gap kg','Person-days','Implementation CHF'],
        [['Current',c.baseline],['What-if',c.alternative]].map(([name, v])=>[name,fmt(v.savings.chf,2),
          percent(v.carbon_fraction),fmt(v.cost_gap_chf,2),fmt(v.carbon_gap_kg),fmt(v.days),fmt(v.spent_chf)])),
        detail('Measures added, removed, or pending approval',{added:c.added,removed:c.removed,pending:c.alternative.pending_approvals,
          selected:c.alternative.selected}));
    } catch(error) { results.textContent=error.message; }
    finally { action.disabled=false; }
  });
  return section;
}
function questions(root, answers) {
  const controls = el('div', null, 'controls');
  const results = el('div');
  root.append(el('h2','Ask about the data'), controls, results);
  Object.entries(answers).forEach(([id, a], i) => {
    const button = el('button', a.title);
    button.setAttribute('aria-pressed', String(i === 0));
    const show = () => {
      for (const b of controls.children) b.setAttribute('aria-pressed', String(b === button));
      results.replaceChildren(el('h3',a.title), el('p',a.method,'muted'));
      if (id === 'unused-seats') {
        results.append(table(['Product','Purchased','Active','Unused','Monthly CHF','Unknown activity rows','Unpriced seats'],
          Object.entries(a.results).map(([name, r]) => [name, fmt(r.purchased), fmt(r.active), fmt(r.unused),
            fmt(r.unused_chf_per_month, 2), fmt(r.unknown_activity_rows), fmt(r.unpriced_unused)])));
      }
      if (id === 'gpu') {
        results.append(table(['Resource','Mean GPU usage','Effort (days)','Annual CHF','Annual CO₂e kg','Decision'],
          a.results.map(r => [r.resource, r.mean_weekly_gpu_pct == null ? '—' : fmt(r.mean_weekly_gpu_pct) + '%',
            fmt(r.days), fmt(r.chf), fmt(r.kg[1]), r.status])));
      }
      if (id === 'production') {
        results.append(table(['Resource','Decision','Nonworkdays with recorded activity','Approver'],
          a.results.map(r => [r.resource, r.decision, fmt(r.active_nonworkday_refs.length), r.approver])));
        a.results.forEach(r => r.ticket_evidence.forEach(t => results.append(el('p', t.ref + ' · ' + (t.title || '') + ' · ' + (t.description || ''), 'callout'))));
      }
      results.append(detail('Calculations and source evidence', a));
    };
    button.addEventListener('click', show);
    controls.append(button);
    if (i === 0) show();
  });
}
function forecastView(root, p) {
  root.append(el('h2','Three-year scenario forecast'), el('p',p.method,'muted'),
    el('p', p.baseline_months_observed + ' of 12 baseline months observed. Annual growth scenarios ' + p.growth.map(percent).join(' / ') + '.'),
    table(['Period','Cost CHF (low / mid / high)','Energy kWh (low / mid / high)','Location CO₂e kg (low / mid / high)'],
      p.results.map(r => [r.period, ...[r.chf,r.kwh,r.kg].map(v => v.map(x=>fmt(x)).join(' / '))])),
    detail('Monthly CHF series',p.results.map(r => ({period:r.period, chf:r.monthly_chf_mid}))));
  get('projections').then(x=>{
    const first = x.annual[0];
    root.append(el('h3','Forecast after planning measures'),
      el('p','Backtest MAE: CHF ' + fmt(x.holdout_mae_chf) + ' (frozen average) · CHF ' +
        fmt(x.holdout_trailing_mae_chf) + ' (rolling average).'),
      el('p','First-year gross savings CHF ' + fmt(first.chf_first_year_gross_savings) +
        ' · Annual run-rate savings CHF ' + fmt(first.chf_annual_run_rate_savings) +
        ' · First-year spend including implementation CHF ' + fmt(first.chf_first_year_cash_including_implementation[1])),
      table(['Year','CHF before','CHF after','kg CO₂e before','kg CO₂e after'],x.annual.map(y=>
        [y.year,fmt(y.before.chf[1]),fmt(y.after_planned_measures.chf[1]),fmt(y.before.kg[1]),fmt(y.after_planned_measures.kg[1])])),
      table(['Documented first-year change','Effective date','CHF delta','kWh delta','kg CO₂e delta'],
        (first.dated_change_contributions||[]).map(r=>[r.source,r.effective_date,fmt(r.chf,2),fmt(r.kwh),fmt(r.kg)])),
      detail('Growth assumptions and holdout check',x));
  }).catch(e=>root.append(el('p',e.message)));
}
function diagnosticView(root,p) {
  root.append(el('h2','Operational diagnostics'), el('p',p.ci_method,'muted'),
    table(['Repository','Runner','Runs','No-change nightlies','Reruns','Flagged CPU-hours'],
      p.ci.map(r=>[r.repo,r.runner,fmt(r.runs),fmt(r.no_change_nightly),fmt(r.reruns),fmt(r.flagged_cpu_h)])));
  const labels = {jobs:'Carbon-aware scheduling',clusters:'Server usage clusters',workload_clusters:'Similar AI, SaaS and job profiles',agents:'AI agents',stale_tables:'Stale table review',
    unviewed_reports:'Reporting refresh review',web_sampling:'Sample-adjusted web traffic',logs:'Log volume',parallel_backup_chains:'Parallel backups',
    projects:'Project hours',chf_per_august_fte:'Annual attributed CHF per August FTE'};
  Object.entries(labels).forEach(([id,label]) => root.append(detail(label, p[id])));
  const stability=p.clusters?.stability;
  const peers=p.clusters?.protection_comparison || [];
  if (stability) root.append(el('h3','Server cluster stability'),
    el('p',stability.matched_servers + ' servers matched · Early/late group overlap ' + percent(stability.co_membership_jaccard)));
  if (peers.length) root.append(table(['Server','Mean CPU %','Weekly uptime h','Decision','Sources'],
    peers.map(r=>[r.server,fmt(r.mean_cpu),fmt(r.weekly_uptime),r.decision,r.sources.join(', ')])));
  get('carbon-replay').then(replay=>{
    const moved=replay.shifted_case_job;
    const blocked=replay.protected_case_job;
    if (!moved && !blocked) return;
    root.append(el('h3','Historical carbon scheduling example'),
      table(['Job','Observed start','Replay start','Modeled g CO₂e savings','Review status'],[
        ...(moved?[[moved.job,moved.current_start,moved.suggested_start,fmt(moved.kg_avoided[1]*1000,2),'Historical replay only']]:[]),
        ...(blocked?[[blocked.job,blocked.current_start,'Kept in place','—','Blocked']]:[])
      ]),detail('Scheduling evidence',replay));
  }).catch(error=>root.append(el('p',error.message)));
  get('ci-attribution').then(data=>{
    const scope=data.rows.filter(r=>r.billed_minutes!=null);
    if(scope.length) root.append(el('h3','CI billing and required checks'),
      table(['Meter month','Billed minutes','CI observed minutes','Minutes for review','Attributed CHF savings'],
        scope.map(r=>[r.meter+' · '+r.month,fmt(r.billed_minutes),fmt(r.minutes),fmt(r.review_candidate_minutes),
          fmt(r.recoverable_chf,2)])),detail('CI attribution and evidence',data));
  }).catch(error=>root.append(el('p',error.message)));
  get('bonus-decisions').then(data=>{
    root.append(el('h3','Decisions from bonus data'),
      table(['Source','Rows accepted','Decision'],data.bonus_sources.map(r=>[r.source,fmt(r.accepted,0),r.decision])),
      detail('Power BI protections',data.powerbi),detail('Backup chain protections',data.backups),detail('Project-hours allocation examples',data.shared_cost));
  }).catch(error=>root.append(el('p',error.message)));
  const rank = selectField('rank','Rank opportunities by',[['chf','Annual CHF'],['kg','Annual location CO₂e']]);
  const mode = selectField('mode','Approval filter',[['planning','Proposed package'],['approved','Owner-approved only']]);
  const result = el('div'); let sequence = 0;
  root.append(el('h3','Recoverable impact in selected package'),rank,mode,result);
  async function draw(){
    const current = ++sequence;
    try{
      const params = new URLSearchParams({rank_by:rank.querySelector('select').value,mode:mode.querySelector('select').value});
      const rows = await get('waste?' + params);
      if(current !== sequence) return;
      result.replaceChildren(rows.length ? table(['Measure','Annual CHF','Annual kg CO₂e','Approval','Approver'],rows.map(m=>[
        m.id,fmt(m.figures.annual_cost_savings.value,2),fmt(m.figures.carbon_savings.value),m.evidence_status,m.approver
      ])) : el('p','No measures in this approval filter.'));
    }catch(error){if(current === sequence) result.textContent=error.message;}
  }
  rank.addEventListener('change',draw);mode.addEventListener('change',draw);draw();
}
function quality(root, records) {
  root.append(el('h2','Sources and reconciliation'), el('p', records.length + ' reconciliation comparisons'),
    table(['Source','Tier','Present','Accepted rows'],baseline.sources.map(r=>[r.file,r.core?'Core':'Bonus',r.present?'Yes':'No',fmt(r.accepted,0)])),
    detail('Audit counts', baseline.audit_counts), detail('Reconciliation details', records),
    link('Audit trail','/api/audit?offset=0&limit=100'), ' ', link('Normalized ledger','/api/ledger?offset=0&limit=100'),
    ' ', link('Factors','/api/factors'), ' ', link('Coverage','/api/coverage'), ' ', link('Shared costs','/api/allocation'),
    ' ', link('AI tariff reconciliation','/api/ai-pricing'), ' ', link('Embodied footprint','/api/embodied'),
    ' ', link('Ticket protections','/api/protections'), ' ', link('Contradictions','/api/contradictions'),
    ' ', link('Footprint coverage by region','/api/footprint-coverage'),
    ' ', link('Decision-critical data gaps','/api/coverage-priorities'),
    ' ', link('Market factors by period','/api/market-breakdown'));
  const queue = el('div');
  get('market-breakdown').then(data=>{
    const regions = new Map();
    for(const row of data.rows){
      const totals=regions.get(row.region) || {modeled:0,covered:0,kg:0};
      totals.modeled+=row.modeled_kwh;totals.covered+=row.covered_kwh;totals.kg+=row.covered_kg;
      regions.set(row.region,totals);
    }
    if(regions.size) root.append(el('h3','Market-based carbon coverage by region'),
      table(['Region','Modeled kWh','Covered kWh','Coverage','Partial kg CO₂e'],[...regions].map(([r,v])=>[
        r,fmt(v.modeled),fmt(v.covered),percent(v.modeled?v.covered/v.modeled:null),v.covered?fmt(v.kg):'—'
      ])),detail('Market factors and monthly coverage',data));
  }).catch(error=>root.append(el('p',error.message)));
  get('coverage-priorities').then(rows=>{
    const shown=rows.slice(0,8);
    if(shown.length) root.append(el('h3','Highest-priority data gaps'),
      table(['Scope','Missing CHF lines','Missing energy lines','Observed CHF without energy','Selected measures affected'],
        shown.map(r=>[r.scope||'Unallocated',r.missing_cost,r.missing_energy,fmt(r.known_chf_without_energy,2),r.affected_selected_measures.length])),
      detail('Gap sources and affected measures',shown));
  }).catch(error=>root.append(el('p',error.message)));
  root.append(el('h3','Data issues to review'),queue);
  get('settings').then(config=>{
    async function draw(){
      const rows = await get('issue-queue');
      queue.replaceChildren(table(['Issue','Scope','Occurrences','Owner','Status'],rows.slice(0,15).map(r=>[
        r.type,r.scope,r.count,r.review?.payload.owner || r.owner,r.review?.payload.status || 'Open'
      ])));
      if(!rows.length || !['admin','reviewer'].includes(config.role)) return;
      const form = el('form',null,'controls');
      const issue = selectField('id','Issue',rows.map(r=>[r.id,r.type+' · '+r.scope]));
      const ownerLabel = el('label','Assigned owner ');
      const owner = el('input');owner.required=true;owner.maxLength=120;ownerLabel.append(owner);
      const evidenceLabel = el('label','Evidence or decision ');
      const evidence = el('input');evidence.required=true;evidence.maxLength=2000;evidenceLabel.append(evidence);
      const state = selectField('status','Status',[['investigating','Investigating'],['resolved','Resolved']]);
      const adjustmentLabel=el('label','Applied adjustment reference (optional) ');
      const adjustment=el('input');adjustmentLabel.append(adjustment);
      const status = el('p');status.setAttribute('aria-live','polite');
      form.append(issue,ownerLabel,evidenceLabel,state,adjustmentLabel,el('button','Save issue review'),status);
      form.addEventListener('submit',async event=>{
        event.preventDefault();
        try{
          await post('issue-review',{run:config.run,id:issue.querySelector('select').value,
            owner:owner.value,evidence:evidence.value,status:state.querySelector('select').value,adjustment_ref:adjustment.value});
          await draw();
        }catch(error){status.textContent=error.message;}
      });
      queue.append(form);
    }
    return draw();
  }).catch(error=>queue.textContent=error.message);
}
function askView(root) {
  const form=el('form',null,'controls');
  const label=el('label','Question ');
  const input=el('input');input.required=true;input.maxLength=500;input.type='search';
  input.placeholder='Top 5 departments by cost';label.append(input);
  const answer=el('div');answer.setAttribute('aria-live','polite');
  form.append(label,el('button','Ask'));
  root.append(el('h2','Ask GreenOps'),el('p','Try “cost by department”, “energy in August 2026”, “CI waste”, or “and carbon?” as a follow-up.','muted'),form,answer);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const button=form.querySelector('button');button.disabled=true;
    try{
      const r=await post('ask',{question:input.value,context:questionContext});questionContext=r.context;
      answer.replaceChildren(el('p',r.answer,'callout'), el('p',r.assistant || 'Local calculation','muted'));
      if(Array.isArray(r.result)&&r.result.length&&r.result[0].group){
        answer.append(table(['Group','Value','Observed lines','Missing lines','Source files'],r.result.map(r=>[
          r.group,Array.isArray(r.value)?r.value.map(x=>fmt(x)).join(' / '):fmt(r.value,2),
          r.observed_lines,r.missing_lines,r.source_files.join(', ')
        ])));
      }
      if(r.result) answer.append(detail('Calculation and source evidence',r.result));
    }catch(e){answer.textContent=e.message;}
    finally{button.disabled=false;}
  });
}
function workspaceView(root, settings) {
  root.append(el('h2','Workspace'),el('p','Current run ' + settings.run.slice(0,12) + ' · ' + settings.role));
  const activity=el('div');
  root.append(activity);
  get('history').then(history=>activity.append(table(['Snapshot','Created','Dataset type','Annual CHF','Location CO₂e kg'],
    history.map(r=>[r.id.slice(0,12),r.created,r.mode,fmt(r.baseline.chf,2),fmt(r.baseline.kg[1])]))))
    .catch(e=>activity.textContent=e.message);
  if(!settings.can_rebuild) return;
  const form=el('form');
  const select=selectField('dataset','Dataset',[['','Current dataset'],...settings.datasets.map(s=>[s,s])]);
  const disclosure=el('details');disclosure.append(el('summary','Edit factor configuration'));
  const label=el('label','Factor JSON');
  const factors=el('textarea');factors.rows=12;label.append(factors);
  disclosure.append(label);
  const button=el('button','Rebuild workspace');
  button.disabled=true;
  const status=el('p');status.setAttribute('aria-live','polite');
  form.append(select,disclosure,button,status);
  root.append(form);
  let original=null;
  get('factors').then(f=>{
    original=JSON.stringify(f,null,2);
    factors.value=original;button.disabled=false;
  }).catch(e=>status.textContent=e.message);
  form.addEventListener('submit',async e=>{
    e.preventDefault();button.disabled=true;
    try{
      const dataset=new FormData(form).get('dataset') || null;
      const edited=factors.value!==original ? JSON.parse(factors.value):null;
      await post('rebuild',{run:settings.run,dataset,factors:edited});
      status.textContent='Rebuilding in the background…';
      while(true){
        await new Promise(resolve=>setTimeout(resolve,1200));
        const state=await get('progress');
        if(state.status==='ready') {location.reload();return;}
        if(state.status==='error') throw new Error(state.message);
      }
    }catch(e){status.textContent=e.message;}
    finally{button.disabled=false;}
  });
}
const render = {summary:drivers, package:packageView, questions, ask:askView, forecast:forecastView, diagnostics:diagnosticView, reconciliation:quality, settings:workspaceView};
async function display(view) {
  const current = ++request;
  const root = $('content');
  root.replaceChildren(el('p','Loading…'));
  try {
    const data = view === 'summary' ? baseline : view === 'ask' ? null : await get(view);
    if (current !== request) return;
    root.replaceChildren();
    render[view](root,data);
  } catch (error) {
    if (current === request) root.replaceChildren(el('p',error.message,'callout warning'));
  }
}
async function start() {
  try {
    baseline = await get('summary');
    $('mode').textContent = baseline.mode;
    $('period').textContent = 'Baseline · September 2025–August 2026';
    const b = baseline.baseline;
    for (const [label, value, description] of [
      ['Annual cost', 'CHF ' + fmt(b.chf, 2), 'Normalized observed spending'],
      ['Energy estimate', fmt(b.kwh[1]) + ' kWh', range(b.kwh) + ' kWh scenario range'],
      ['Location-based emissions', fmt(b.kg[1]) + ' kg', range(b.kg) + ' kg CO₂e scenario range'],
      ['Partial market-based estimate', fmt(b.kg_market[1]) + ' kg',
        percent(baseline.footprint_coverage.market_coverage) + ' of modeled energy covered']
    ]) {
      const node = el('article',null,'stat');
      node.append(el('span',label),el('strong',value),el('span',description));
      $('stats').append(node);
    }
    const missing = baseline.sources.filter(s=>s.core && !s.present).length;
    $('coverage').textContent = fmt(b.missing_cost,0) + ' lines without cost · ' + fmt(b.missing_energy,0) +
      ' lines without energy estimates · ' + missing + ' missing core files';
    document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {
      document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      display(button.dataset.view);
    }));
    display('summary');
  } catch (error) {
    $('content').replaceChildren(el('p',error.message,'callout warning'));
  }
}
start();
