#!/usr/bin/env python3
# Assemble the brief-driven film from real clips + typographic cards + narration.
#   python3 video/build-film.py
import subprocess, os, json

V = os.path.dirname(os.path.abspath(__file__))
os.chdir(V)
os.makedirs('beats', exist_ok=True)

def run(*a):
    subprocess.run(list(a), check=True)

def ff(*a):
    run('ffmpeg', '-v', 'error', '-y', *a)

ENC = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', '30', '-an']

def still_from(video, t, out):
    ff('-ss', str(t), '-i', video, '-frames:v', '1', out)

def beat_still(png, dur, out, fade_in=0.0, fade_out=0.0):
    vf = 'scale=1920:1080,format=yuv420p'
    if fade_in: vf += f',fade=t=in:st=0:d={fade_in}'
    if fade_out: vf += f',fade=t=out:st={dur - fade_out}:d={fade_out}'
    ff('-loop', '1', '-t', str(dur), '-i', png, '-vf', vf, *ENC, out)

def beat_clip(clip, dur, out, overlays=()):
    # pad with frozen last frame to dur, then overlay fading PNG cards
    probe = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                            '-of', 'default=nw=1:nk=1', clip], capture_output=True, text=True)
    src = float(probe.stdout.strip())
    pad = max(0, dur - src)
    inputs = ['-i', clip]
    fc = f'[0:v]tpad=stop_mode=clone:stop_duration={pad:.2f},scale=1920:1080[base]'
    cur = 'base'
    for i, (png, s, e) in enumerate(overlays, start=1):
        inputs += ['-loop', '1', '-t', str(dur), '-i', png]
        fc += f';[{i}:v]format=argb,fade=t=in:st={s}:d=0.4:alpha=1,fade=t=out:st={e}:d=0.4:alpha=1[ov{i}]'
        fc += f";[{cur}][ov{i}]overlay=0:0:enable='between(t,{s},{e + 0.4})'[b{i}]"
        cur = f'b{i}'
    fc += f';[{cur}]format=yuv420p[v]'
    ff(*inputs, '-filter_complex', fc, '-map', '[v]', '-t', str(dur), *ENC, out)

C = 'clips'
K = 'cards'

# stills we need
still_from(f'{C}/03-agent-solver.mp4', 18.2, 'beats/still-gala.png')   # seated gala
still_from(f'{C}/01-gala-load.mp4', 0.6, 'beats/still-picker.png')     # scenario picker

BEATS = [
    ('b0', lambda o: beat_still(f'{K}/t0-title.png', 4.2, o, fade_in=0.6, fade_out=0.5), 4.2, None, 0),
    ('b1', lambda o: beat_clip(f'{C}/01-gala-load.mp4', 8.0, o), 8.0, None, 0),
    ('b2', lambda o: beat_clip(f'{C}/02-human-pins.mp4', 12.4, o,
        overlays=[(f'{K}/o1a.png', 1.0, 6.0), (f'{K}/o1b.png', 6.6, 11.6)]), 12.4, 'nar/n1.wav', 0.4),
    ('b3', lambda o: beat_clip(f'{C}/03-agent-solver.mp4', 18.5, o,
        overlays=[(f'{K}/o2a.png', 8.5, 12.8), (f'{K}/o2b.png', 14.4, 18.0)]), 18.5, 'nar/n2.wav', 0.5),
    ('b4', lambda o: beat_clip(f'{C}/04-conflict-explain.mp4', 12.6, o,
        overlays=[(f'{K}/o3.png', 7.6, 12.1)]), 12.6, 'nar/n3.wav', 0.4),
    ('b5', lambda o: beat_clip(f'{C}/05-dynamic-tools.mp4', 12.5, o,
        overlays=[(f'{K}/o4.png', 4.6, 11.7)]), 12.5, 'nar/n4.wav', 0.5),
    ('b6', lambda o: beat_clip(f'{C}/06-caterer.mp4', 9.6, o), 9.6, 'nar/n5.wav', 0.4),
    ('b7', lambda o: beat_clip('beats/still-gala-vid.mp4', 21.6, o,
        overlays=[(f'{K}/o6.png', 0.8, 20.8)]), 21.6, 'nar/n6.wav', 0.6),
    ('b8', lambda o: beat_clip('beats/still-picker-vid.mp4', 4.6, o), 4.6, 'nar/n7.wav', 0.3),
    ('b9', lambda o: beat_still(f'{K}/t8-close.png', 5.2, o, fade_in=0.5, fade_out=0.8), 5.2, None, 0),
]

# make still-videos used as beat bases
beat_still('beats/still-gala.png', 21.6, 'beats/still-gala-vid.mp4')
beat_still('beats/still-picker.png', 4.6, 'beats/still-picker-vid.mp4')

starts, at = {}, 0.0
concat_lines = []
for name, build, dur, nar, off in BEATS:
    out = f'beats/{name}.mp4'
    build(out)
    starts[name] = at
    concat_lines.append(f"file '{name}.mp4'")
    at += dur
total = at
print('beats built, total', round(total, 2))

open('beats/concat.txt', 'w').write('\n'.join(concat_lines) + '\n')
ff('-f', 'concat', '-safe', '0', '-i', 'beats/concat.txt', '-c', 'copy', 'beats/film-video.mp4')

# narration mix
nars = [(starts[n] + off, nar) for n, _, _, nar, off in BEATS if nar]
inputs, fc, labels = [], [], []
for i, (t, f) in enumerate(nars):
    inputs += ['-i', f]
    fc.append(f'[{i}]afade=t=in:d=0.04,areverse,afade=t=in:d=0.04,areverse,adelay={int(t * 1000)}:all=1[a{i}]')
    labels.append(f'[a{i}]')
fc.append(''.join(labels) + f'amix=inputs={len(nars)}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[mix]')
ff(*inputs, '-filter_complex', ';'.join(fc), '-map', '[mix]', '-ar', '48000', 'beats/vo.wav')

ff('-i', 'beats/film-video.mp4', '-i', 'beats/vo.wav',
   '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
   '-map', '0:v:0', '-map', '1:a:0', '-t', str(total), '-movflags', '+faststart', 'duet-film.mp4')

d = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size',
                    '-of', 'default=nw=1', 'duet-film.mp4'], capture_output=True, text=True)
print(d.stdout.strip())
print(json.dumps({k: round(v, 2) for k, v in starts.items()}))
