// Each question belongs to exactly one study domain; VPN fundamentals are concepts.
export function domainFor(blueprint, ch, q) {
  if (ch === 8) return q.section === blueprint.vpnConceptSection ? '1.0' : '2.0';
  return blueprint.domains.find(d => d.chapters.includes(ch))?.id;
}
export function allocate(total, weights) {
  const sum = weights.reduce((a,b)=>a+b,0);
  if (!sum) throw new Error('No questions available for this study preset.');
  const exact = weights.map(w => total*w/sum), counts=exact.map(Math.floor);
  const order=exact.map((v,i)=>[v-counts[i],i]).sort((a,b)=>b[0]-a[0] || a[1]-b[1]);
  let left=total-counts.reduce((a,b)=>a+b,0);
  for (const [,i] of order) if(left-->0) counts[i]++;
  return counts;
}
export function selectExam(blueprint, pools, count, shuffle) {
  const quotas=allocate(count,blueprint.domains.map(d=>d.weight));
  const chosen=[];
  blueprint.domains.forEach((domain,di)=>{
    const groups=domain.chapters.map(ch=>shuffle((pools[ch] || []).filter(x=>domainFor(blueprint,ch,x.q)===domain.id)));
    if(groups.reduce((n,g)=>n+g.length,0)<quotas[di]) throw new Error(`Not enough questions for ${domain.name}.`);
    // Round robin balances chapters while respecting small pools and never duplicating questions.
    let left=quotas[di], cursor=0;
    while(left) { const g=groups[cursor++%groups.length]; if(g.length) { chosen.push({...g.pop(),domain:domain.id}); left--; } }
  });
  return shuffle(chosen);
}
