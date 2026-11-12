import re, subprocess, json, os
os.chdir(os.path.dirname(os.path.abspath(__file__)))
def dur(f): return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',f]).decode())
os.makedirs('rendu_tmp',exist_ok=True); os.makedirs('sous-titres',exist_ok=True)
rows={}
for l in open('script.md',encoding='utf8'):
    c=[x.strip() for x in l.strip().strip('|').split('|')]
    if len(c)>=6 and c[0].isdigit(): rows[int(c[0])]=c[3]
CAP={2:99,3:99,4:99,5:11,6:21,7:23.2,8:24.8,9:15.3,10:8}
def ts(t):
    h=int(t//3600);m=int(t%3600//60);s=t%60
    return f"{h:02d}:{m:02d}:{int(s):02d},{int(round((s-int(s))*1000)):03d}"
def cues(txt):
    ph=[p.strip() for p in re.split(r'(?<=[.:;])\s+',txt) if p.strip()]
    out=[]
    for p in ph:
        lines=[];cur=''
        for w in p.split():
            if cur and len(cur)+1+len(w)>42: lines.append(cur);cur=w
            else: cur=(cur+' '+w).strip()
        if cur: lines.append(cur)
        for i in range(0,len(lines),2): out.append(lines[i:i+2])
    return out
res={}
parts=[]
for n in range(1,11):
    brut=f'brut/plan-{n}.mp4'; v=dur(brut)
    if n==1:
        fin=3.0; voice=0
    else:
        voice=dur(f'voix/plan-{n}.mp3')
        fin=round(max(v if v<CAP[n] else CAP[n], voice+0.6),2) if False else round(max(min(v,CAP[n]),voice+0.6),2)
    res[n]=dict(video=round(v,2),voix=round(voice,2),finale=fin)
    vf=f"tpad=stop_mode=clone:stop_duration={max(0,fin-v)+0.5:.2f},trim=duration={fin},setpts=PTS-STARTPTS,pad=1280:800:0:0:color=#F4F6F2"
    if n==1:
        open('sous-titres/plan-1.srt','w',encoding='utf8').write("1\n00:00:00,000 --> 00:00:03,000\nTom Weisz · exercice Stonks Holding\nnovembre 2026 · voix de synthèse\n")
        vf+=",subtitles=sous-titres/plan-1.srt:force_style='FontName=Helvetica,FontSize=8,PrimaryColour=&H0020231B,Outline=0,Shadow=0,Alignment=2,MarginV=5'"
    if n>1:
        cs=cues(rows[n]); tot=sum(len(' '.join(c)) for c in cs); t=0.3; srt=[]
        for i,c in enumerate(cs,1):
            d=voice*len(' '.join(c))/tot
            srt.append(f"{i}\n{ts(t)} --> {ts(t+d)}\n"+'\n'.join(c)+"\n"); t+=d
        open(f'sous-titres/plan-{n}.srt','w',encoding='utf8').write('\n'.join(srt))
        vf+=",subtitles=sous-titres/plan-%d.srt:force_style='FontName=Helvetica,FontSize=8,PrimaryColour=&H0020231B,Outline=0,Shadow=0,Alignment=2,MarginV=5'"%n
    seg=f'rendu_tmp/seg-{n}.mp4'
    cmd=['ffmpeg','-y','-loglevel','error','-i',brut]
    if n>1: cmd+=['-i',f'voix/plan-{n}.mp3']; af="[1:a]aresample=44100,aformat=channel_layouts=stereo,adelay=300|300,apad,atrim=duration=%s[a]"%fin
    else: cmd+=['-f','lavfi','-i','anullsrc=r=44100:cl=stereo']; af="[1:a]atrim=duration=%s[a]"%fin
    cmd+=['-filter_complex',f"[0:v]{vf}[v];{af}",'-map','[v]','-map','[a]','-r','30','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','44100','-t',str(fin),seg]
    subprocess.check_call(cmd); parts.append(seg)
open('rendu_tmp/liste.txt','w').write(''.join(f"file '{os.path.abspath(p)}'\n" for p in parts))
subprocess.check_call(['ffmpeg','-y','-loglevel','error','-f','concat','-safe','0','-i','rendu_tmp/liste.txt','-c','copy','demo-tom-weisz-richemont3b.mp4'])
subprocess.check_call(['ffmpeg','-y','-loglevel','error','-i','demo-tom-weisz-richemont3b.mp4','-c:v','copy','-an','apercu-muet.mp4'])
json.dump(res,open('rendu_tmp/durees.json','w'))
print(json.dumps(res)); print('total',dur('demo-tom-weisz-richemont3b.mp4'))
