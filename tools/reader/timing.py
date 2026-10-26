import sys, json, time
from kokoro_onnx import Kokoro
from prep import speak
docfile, out = sys.argv[1:3]
k=Kokoro("kokoro-v1.0.onnx","voices-v1.0.bin"); SR=24000
pause={"H2":(1.6,0.8),"H3":(1.0,0.45),"B":(0,0.45)}
t=0; rows=[]; t0=time.time()
for ln in open(docfile):
    st,nest,txt=ln.rstrip("\n").split("|",2)
    kind="H2" if st=="HEADING_2" else "H3" if st=="HEADING_3" else "B"
    s=speak(txt)
    if kind!="B" and not s.endswith((".",":","?")): s+="."
    a,_=k.create(s,voice="am_michael",speed=1.0,lang="en-us")
    pre,post=pause[kind]
    start=t+pre; end=start+len(a)/SR
    rows.append({"kind":kind,"nest":int(nest),"text":txt,"spoken":s,"start":round(start,3),"end":round(end,3)})
    t=end+post
json.dump({"total":round(t,3),"lines":rows},open(out,"w"),indent=0)
print(out,"synth",round(t,1),"s in",round(time.time()-t0),"s")
