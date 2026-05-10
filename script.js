document.addEventListener('DOMContentLoaded', () => {
    const noteEditor = document.getElementById('note-editor');
    const pinNoteBtn = document.getElementById('pin-note');
    const letGoBtn = document.getElementById('let-go');
    const newNoteBtn = document.getElementById('new-note-btn');
    const effectSelect = document.getElementById('effect-select');
    const notesList = document.getElementById('notes-list');
    const menuBtn = document.getElementById('menu-btn');
    const sidebar = document.querySelector('.sidebar');

    let notes = getNotes();
    let currentNoteId = null;

    renderNotesList();

    function getNotes() {
        const notesJSON = localStorage.getItem('notes');
        return notesJSON ? JSON.parse(notesJSON) : [];
    }

    function saveNotes() {
        localStorage.setItem('notes', JSON.stringify(notes));
    }

    function renderNotesList() {
        notesList.innerHTML = '';
        notes.sort((a, b) => new Date(b.lastUpdated) - new Date(a.lastUpdated));
        notes.forEach(note => {
            const noteItem = document.createElement('div');
            noteItem.classList.add('note-item');
            noteItem.dataset.id = note.id;

            const excerpt = document.createElement('div');
            excerpt.classList.add('note-excerpt');
            excerpt.textContent = note.content.substring(0, 50) + (note.content.length > 50 ? '...' : '');

            const date = document.createElement('div');
            date.classList.add('note-date');
            date.textContent = new Date(note.lastUpdated).toLocaleString();

            noteItem.appendChild(excerpt);
            noteItem.appendChild(date);
            notesList.appendChild(noteItem);

            noteItem.addEventListener('click', () => {
                if (noteEditor.value && !currentNoteId) {
                    saveCurrentNote();
                }
                loadNote(note.id);
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('show');
                }
            });
        });
    }

    function loadNote(id) {
        const note = notes.find(note => note.id === id);
        if (note) {
            noteEditor.value = note.content;
            currentNoteId = id;
            updatePinStatus();
        }
    }

    function newNote() {
        if (noteEditor.value && !currentNoteId) {
            // Unpinned note with content — animate it away without saving
            triggerDestructionAnimation(() => {
                noteEditor.value = '';
                currentNoteId = null;
                updatePinStatus();
            });
        } else {
            // Saved note or empty editor — just clear
            noteEditor.value = '';
            currentNoteId = null;
            updatePinStatus();
        }
    }

    function saveCurrentNote() {
        const content = noteEditor.value;
        if (!content.trim()) return; // Don't save empty notes

        if (currentNoteId) {
            const note = notes.find(note => note.id === currentNoteId);
            if (note) {
                note.content = content;
                note.lastUpdated = new Date();
            }
        } else {
            const newNote = {
                id: Date.now(),
                content: content,
                lastUpdated: new Date()
            };
            notes.push(newNote);
            currentNoteId = newNote.id;
        }
        saveNotes();
        renderNotesList();
        updatePinStatus();
    }

    function deleteCurrentNote() {
        if (currentNoteId) {
            notes = notes.filter(note => note.id !== currentNoteId);
            saveNotes();
            renderNotesList();
        }
        noteEditor.value = '';
        currentNoteId = null;
        updatePinStatus();
    }

    function triggerLetGo() {
        if (!noteEditor.value.trim() && !currentNoteId) return;
        triggerDestructionAnimation(() => {
            deleteCurrentNote();
        });
    }

    // --- Destruction animation engine ---

    const DESTRUCTION_ANIMATIONS = ['crumple', 'shred', 'burn', 'laser', 'stamp'];
    // Animation durations in milliseconds. CSS keyframe durations must match these values.
    const ANIMATION_DURATIONS = { crumple: 2200, shred: 2200, burn: 2800, laser: 2800, stamp: 2500 };
    // How long the laser beam scans before the paper starts disintegrating
    const LASER_SCAN_DURATION = 1500;

    // =====================================================
    // WebGL-enhanced destruction effects
    // Detected once at load; CSS animations are the fallback.
    // =====================================================

    const HAS_WEBGL = (() => {
        try { return !!(document.createElement('canvas').getContext('webgl')); }
        catch (e) { return false; }
    })();

    // Shared GLSL value-noise functions (concatenated into each fragment shader)
    const _GLSL_NOISE = `
        float _rand(vec2 c){return fract(sin(dot(c,vec2(12.9898,78.233)))*43758.5453);}
        float _vnoise(vec2 p){
            vec2 i=floor(p),f=fract(p);
            f=f*f*(3.0-2.0*f);
            return mix(mix(_rand(i),_rand(i+vec2(1,0)),f.x),
                       mix(_rand(i+vec2(0,1)),_rand(i+vec2(1,1)),f.x),f.y);
        }
    `;

    // Create a fixed canvas that exactly overlays the paper element
    function _glCanvas(paper) {
        const r = paper.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const c = document.createElement('canvas');
        c.width  = Math.round(r.width  * dpr);
        c.height = Math.round(r.height * dpr);
        Object.assign(c.style, {
            position: 'fixed', top: r.top + 'px', left: r.left + 'px',
            width: r.width + 'px', height: r.height + 'px',
            zIndex: '9999', pointerEvents: 'none',
        });
        document.body.appendChild(c);
        return c;
    }

    // Compile + link a WebGL program; returns null on any error
    function _glProg(gl, vertSrc, fragSrc) {
        function compile(type, src) {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                console.error('Shader compile error:', gl.getShaderInfoLog(s));
                return null;
            }
            return s;
        }
        const v = compile(gl.VERTEX_SHADER, vertSrc);
        const f = compile(gl.FRAGMENT_SHADER, fragSrc);
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error('Program link error:', gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    // Upload a full-screen quad (two triangles covering clip space [-1,1]²)
    function _quadBuf(gl) {
        const b = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, b);
        gl.bufferData(gl.ARRAY_BUFFER,
            new Float32Array([-1,-1, 1,-1, -1,1,  1,-1, 1,1, -1,1]),
            gl.STATIC_DRAW);
        return b;
    }

    // Enable and point the 'a_pos' vec2 attribute at the currently-bound buffer
    function _bindPos(gl, prog, buf) {
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        const loc = gl.getAttribLocation(prog, 'a_pos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }

    // ---- WebGL Crumple ----
    // Grid mesh whose vertices distort and collapse over time, with noise-based
    // fold shadows, then scale to a ball and fly off screen.
    function animateCrumpleGL(paper, done) {
        const canvas = _glCanvas(paper);
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) { canvas.remove(); animateCrumple(paper, done); return; }

        paper.style.visibility = 'hidden';
        const DUR = ANIMATION_DURATIONS.crumple / 1000;
        const N = 22; // NxN grid

        // Build vertex positions and a random per-vertex collapse direction
        const verts = [], collapseVecs = [];
        for (let y = 0; y <= N; y++) for (let x = 0; x <= N; x++) {
            verts.push((x / N) * 2 - 1, (y / N) * 2 - 1);
            const a = Math.random() * Math.PI * 2;
            const r = 0.5 + Math.random() * 0.8;
            collapseVecs.push(Math.cos(a) * r, Math.sin(a) * r);
        }
        const idx = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
            const tl = y*(N+1)+x, tr = tl+1, bl = tl+(N+1), br = bl+1;
            idx.push(tl, bl, tr,  tr, bl, br);
        }

        const VERT = `
            attribute vec2 a_pos;
            attribute vec2 a_col;   /* per-vertex collapse direction */
            uniform   float u_t;   /* 0 → 1 */
            uniform   vec2  u_fly;
            varying   vec2  v_uv;
            void main(){
                v_uv = a_pos * 0.5 + 0.5;
                float t  = u_t, t2 = t*t, t3 = t2*t;
                /* Multi-frequency warp that intensifies over time */
                float wx = sin(a_pos.x*5.0+a_pos.y*3.0+t*8.0)*0.16*t
                         + cos(a_pos.y*6.0-a_pos.x*4.0+t*6.0)*0.10*t;
                float wy = cos(a_pos.x*4.0+a_pos.y*5.0-t*7.0)*0.14*t
                         + sin(a_pos.y*7.0+a_pos.x*3.0+t*5.0)*0.09*t;
                vec2 warp     = vec2(wx, wy);
                vec2 collapse = a_col * t2 * 1.4;       /* pull each vertex inward */
                float scale   = 1.0 - t2 * 0.86;        /* shrink to a ball */
                vec2 pos      = (a_pos + warp + collapse) * scale + u_fly * t3 * 2.2;
                gl_Position   = vec4(pos, 0.0, 1.0);
            }`;
        const FRAG = `
            precision mediump float;
            varying vec2  v_uv;
            uniform float u_t;
            ${_GLSL_NOISE}
            void main(){
                /* Ruled-line notebook paper texture that clearly shows the deformation */
                float lineY  = fract(v_uv.y * 18.0);
                float lineAmt = smoothstep(0.90, 0.95, lineY) * max(0.0, 1.0 - u_t * 2.2);
                /* Red margin line near the left edge */
                float margin = (1.0 - smoothstep(0.0, 0.006, abs(v_uv.x - 0.14))) * max(0.0, 1.0 - u_t * 2.2);

                /* Fold shadows that deepen as the paper crumples */
                float n = _vnoise(v_uv*7.0 + u_t*3.0)*0.55
                        + _vnoise(v_uv*16.0 - u_t*2.5)*0.28;
                float shade = clamp(1.0 - n * u_t * 1.9, 0.05, 1.0);

                /* Paper: white base, blue ruled lines, red margin */
                vec3 paper = vec3(shade);
                paper = mix(paper, vec3(shade*0.80, shade*0.88, shade*1.0), lineAmt * 0.55);
                paper = mix(paper, vec3(min(shade+0.2,1.0)*0.85, shade*0.45, shade*0.45), margin * 0.5);

                float a = 1.0 - smoothstep(0.72, 1.0, u_t);
                gl_FragColor = vec4(paper, a);
            }`;

        const prog = _glProg(gl, VERT, FRAG);
        if (!prog) { canvas.remove(); paper.style.visibility = ''; animateCrumple(paper, done); return; }

        const vBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.STATIC_DRAW);

        const cBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, cBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(collapseVecs), gl.STATIC_DRAW);

        const iBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);

        gl.useProgram(prog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const aPos = gl.getAttribLocation(prog, 'a_pos');
        const aCol = gl.getAttribLocation(prog, 'a_col');
        const uT   = gl.getUniformLocation(prog, 'u_t');
        const uFly = gl.getUniformLocation(prog, 'u_fly');
        gl.uniform2f(uFly, 0.4 + Math.random() * 0.5, 0.25 + Math.random() * 0.35);

        const t0 = performance.now();
        (function frame() {
            const t = Math.min((performance.now() - t0) / 1000 / DUR, 1);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);

            gl.bindBuffer(gl.ARRAY_BUFFER, vBuf);
            gl.enableVertexAttribArray(aPos);
            gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, cBuf);
            gl.enableVertexAttribArray(aCol);
            gl.vertexAttribPointer(aCol, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, iBuf);
            gl.uniform1f(uT, t);
            gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);

            if (t < 1) requestAnimationFrame(frame);
            else { canvas.remove(); done(); }
        })();
    }

    // ---- WebGL Burn ----
    // Full-screen quad with a fragment shader that sweeps an organic fire line
    // from the bottom of the paper to the top: transparent below (burned away),
    // glowing ember edge, flickering fire band, then heat-haze on intact paper.
    function animateBurnGL(paper, done) {
        const canvas = _glCanvas(paper);
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) { canvas.remove(); animateBurn(paper, done); return; }

        paper.style.visibility = 'hidden';
        const DUR = ANIMATION_DURATIONS.burn / 1000;

        const VERT = `
            attribute vec2 a_pos;
            varying   vec2 v_uv;
            void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0,1); }`;
        const FRAG = `
            precision mediump float;
            varying vec2  v_uv;
            uniform float u_t;   /* 0 → 1 burn progress */
            ${_GLSL_NOISE}
            void main(){
                /* Fire sweeps from bottom (v_uv.y = 0) to top (v_uv.y = 1).
                   Overshoot by 12 % so the last sliver of paper fully burns. */
                float burn = u_t * 1.12;

                /* Jagged organic edge via multi-octave noise */
                float edge = _vnoise(vec2(v_uv.x*6.0,  u_t*3.5))*0.09
                           + _vnoise(vec2(v_uv.x*14.0, u_t*8.0))*0.04;
                float front = burn + edge;

                const float CHAR_BAND_W = 0.045;  /* charred-ember band width  */
                const float FIRE_BAND_W = 0.10;   /* fire-glow band above char */

                if (v_uv.y < front - CHAR_BAND_W) {
                    discard;  /* burned away */
                } else if (v_uv.y < front) {
                    /* Charred / glowing ember zone */
                    float f   = (v_uv.y - (front - CHAR_BAND_W)) / CHAR_BAND_W;
                    vec3  col = mix(vec3(0.04,0.01,0.0), vec3(0.95,0.3,0.0), f*f);
                    /* Scattered bright sparks */
                    float spk = _rand(v_uv*45.0 + vec2(u_t*13.0, u_t*7.7));
                    col += vec3(1.0,0.5,0.0) * step(0.93, spk) * (1.0 - f);
                    gl_FragColor = vec4(col, 1.0);
                } else if (v_uv.y < front + FIRE_BAND_W) {
                    /* Fire band: deep orange at base → bright yellow at tip */
                    float f    = (v_uv.y - front) / FIRE_BAND_W;
                    vec3  fire = mix(vec3(1.0,0.45,0.0), vec3(1.0,0.92,0.2), sqrt(f));
                    float flk  = 0.72 + 0.28*_vnoise(vec2(v_uv.x*5.0, u_t*22.0));
                    gl_FragColor = vec4(fire * flk, (1.0 - f) * 0.92);
                } else {
                    /* Intact paper: subtle heat haze ahead of the fire */
                    float heat = clamp(1.0 - (v_uv.y - front - FIRE_BAND_W)*7.0, 0.0, 1.0);
                    heat *= heat;
                    vec3 paper = vec3(1.0 - heat*0.07, 1.0 - heat*0.11, 1.0 - heat*0.22);
                    gl_FragColor = vec4(paper, 1.0);
                }
            }`;

        const prog = _glProg(gl, VERT, FRAG);
        if (!prog) { canvas.remove(); paper.style.visibility = ''; animateBurn(paper, done); return; }

        gl.useProgram(prog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const qBuf = _quadBuf(gl);
        _bindPos(gl, prog, qBuf);
        const uT = gl.getUniformLocation(prog, 'u_t');

        const t0 = performance.now();
        (function frame() {
            const t = Math.min((performance.now() - t0) / 1000 / DUR, 1);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uT, t);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            if (t < 1) requestAnimationFrame(frame);
            else { canvas.remove(); done(); }
        })();
    }

    // ---- WebGL Laser ----
    // The beam sweeps top→bottom. Where it passes, the paper chars:
    // white-hot glow → orange → dark-brown → black. Small fire licks rise
    // from the cut edge while the scan is in progress. After the scan,
    // charred fragments dissolve away with per-fragment random stagger.
    function animateLaserGL(paper, done) {
        const canvas = _glCanvas(paper);
        const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
        if (!gl) { canvas.remove(); animateLaser(paper, done); return; }

        paper.style.visibility = 'hidden';
        const TOTAL_DUR = ANIMATION_DURATIONS.laser / 1000;
        const SCAN_DUR  = LASER_SCAN_DURATION / 1000;

        const VERT = `
            attribute vec2 a_pos;
            varying   vec2 v_uv;
            void main(){ v_uv = a_pos*0.5+0.5; gl_Position = vec4(a_pos,0,1); }`;
        const FRAG = `
            precision mediump float;
            varying vec2  v_uv;
            uniform float u_elapsed;
            uniform float u_scanDur;
            ${_GLSL_NOISE}
            void main(){
                /* beamY moves from 1 (top) to 0 (bottom) during the scan.
                   cutTime = when the beam reaches this fragment's row.
                   tsc     = seconds elapsed since this row was cut. */
                float beamY   = 1.0 - clamp(u_elapsed / u_scanDur, 0.0, 1.0);
                float cutTime = (1.0 - v_uv.y) * u_scanDur;
                float tsc     = u_elapsed - cutTime;
                bool  scanning = u_elapsed < u_scanDur;

                /* ==== BEAM LINE ==== */
                float dy = v_uv.y - beamY;
                if (scanning && abs(dy) < 0.007) {
                    float d    = abs(dy) / 0.007;
                    vec3  bCol = mix(vec3(1.0, 1.0, 0.95), vec3(1.0, 0.08, 0.0), d * d);
                    gl_FragColor = vec4(bCol, 1.0);
                    return;
                }

                if (tsc < 0.0) {
                    /* ==== INTACT PAPER ==== */
                    /* Tiny fire lick on intact side just below beam */
                    float distToBeam = beamY - v_uv.y;
                    if (scanning && distToBeam < 0.07) {
                        float f   = distToBeam / 0.07;
                        float flk = 0.5 + 0.5 * _vnoise(vec2(v_uv.x*5.0 + u_elapsed*2.0, u_elapsed*20.0));
                        if (flk > 0.52 + f * 0.55) {
                            vec3 fCol = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.88, 0.15), f * 1.6);
                            gl_FragColor = vec4(fCol, (1.0 - f) * flk * 0.65);
                            return;
                        }
                    }
                    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
                    return;
                }

                /* ==== CUT ZONE: char progression ==== */
                /* 0 = just cut (white-hot), 1 = fully charred (black) */
                float cp = clamp(tsc / 0.55, 0.0, 1.0);

                vec3 charCol;
                if (cp < 0.25) {
                    /* White-hot → orange glow */
                    charCol = mix(vec3(1.0, 0.95, 0.75), vec3(1.0, 0.42, 0.04), cp / 0.25);
                } else if (cp < 0.65) {
                    /* Orange → dark red/brown */
                    charCol = mix(vec3(1.0, 0.42, 0.04), vec3(0.20, 0.04, 0.01), (cp - 0.25) / 0.40);
                } else {
                    /* Dark brown → black char */
                    charCol = mix(vec3(0.20, 0.04, 0.01), vec3(0.04, 0.01, 0.0), (cp - 0.65) / 0.35);
                }

                /* Scattered sparks near the fresh cut edge */
                float spk = _rand(v_uv * 53.0 + vec2(u_elapsed * 11.0, u_elapsed * 7.5));
                charCol += vec3(1.0, 0.68, 0.12) * step(0.95, spk) * clamp(1.0 - cp * 3.5, 0.0, 1.0);

                /* Fire lick rising from the char zone just above the beam (cut side) */
                if (scanning && dy > 0.0 && dy < 0.055) {
                    float f   = dy / 0.055;
                    float flk = 0.58 + 0.42 * _vnoise(vec2(v_uv.x * 6.0, u_elapsed * 26.0));
                    vec3  fC  = mix(vec3(1.0, 0.48, 0.0), vec3(1.0, 0.88, 0.15), f);
                    charCol   = mix(charCol, fC, (1.0 - f) * flk * 0.85);
                }

                /* ==== DISSOLUTION after scan ==== */
                if (u_elapsed > u_scanDur) {
                    float dissolveDelay = 0.05 + _rand(v_uv * 31.0 + vec2(1.7, 2.3)) * 0.85;
                    float dT = (u_elapsed - u_scanDur) - dissolveDelay;
                    if (dT > 0.0) {
                        float a = 1.0 - clamp(dT / 0.22, 0.0, 1.0);
                        if (a <= 0.0) discard;
                        gl_FragColor = vec4(charCol, a);
                        return;
                    }
                }

                gl_FragColor = vec4(charCol, 1.0);
            }`;

        const prog = _glProg(gl, VERT, FRAG);
        if (!prog) { canvas.remove(); paper.style.visibility = ''; animateLaser(paper, done); return; }

        gl.useProgram(prog);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        const qBuf = _quadBuf(gl);
        _bindPos(gl, prog, qBuf);
        const uElapsed = gl.getUniformLocation(prog, 'u_elapsed');
        const uScanDur = gl.getUniformLocation(prog, 'u_scanDur');
        gl.uniform1f(uScanDur, SCAN_DUR);

        const t0 = performance.now();
        (function frame() {
            const elapsed = (performance.now() - t0) / 1000;
            const t = Math.min(elapsed / TOTAL_DUR, 1);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
            gl.uniform1f(uElapsed, elapsed);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            if (t < 1) requestAnimationFrame(frame);
            else { canvas.remove(); done(); }
        })();
    }

    function triggerDestructionAnimation(callback) {
        const paper = document.querySelector('.paper');
        if (paper.dataset.animating) return false;
        paper.dataset.animating = 'true';

        const selected = effectSelect.value;
        const type = selected === 'random'
            ? DESTRUCTION_ANIMATIONS[Math.floor(Math.random() * DESTRUCTION_ANIMATIONS.length)]
            : selected;

        const done = () => {
            delete paper.dataset.animating;
            paper.querySelectorAll('.anim-overlay').forEach(el => el.remove());
            paper.style.position = '';
            paper.style.overflow = '';
            paper.style.visibility = '';
            callback();
        };

        switch (type) {
            case 'crumple': (HAS_WEBGL ? animateCrumpleGL : animateCrumple)(paper, done); break;
            case 'shred':   animateShred(paper, done);                                     break;
            case 'burn':    (HAS_WEBGL ? animateBurnGL    : animateBurn   )(paper, done); break;
            case 'laser':   (HAS_WEBGL ? animateLaserGL   : animateLaser  )(paper, done); break;
            case 'stamp':   animateStamp(paper, done);                                     break;
        }
        return true;
    }

    function animateCrumple(paper, done) {
        paper.classList.add('anim-crumple');
        setTimeout(() => { paper.classList.remove('anim-crumple'); done(); }, ANIMATION_DURATIONS.crumple);
    }

    function animateShred(paper, done) {
        const rect = paper.getBoundingClientRect();
        const paperBg = getComputedStyle(paper).backgroundColor || 'white';
        const COUNT = 16;
        const container = document.createElement('div');
        container.className = 'anim-overlay';
        Object.assign(container.style, {
            position: 'fixed',
            top:  rect.top  + 'px',
            left: rect.left + 'px',
            width:  rect.width  + 'px',
            height: rect.height + 'px',
            zIndex: '9999',
            pointerEvents: 'none',
            overflow: 'hidden',
        });
        const stripWidth = rect.width / COUNT;
        for (let i = 0; i < COUNT; i++) {
            const strip = document.createElement('div');
            const delay = i * 50 + Math.random() * 100;
            const rot   = (Math.random() - 0.5) * 90; // range: -45° to +45°
            strip.style.cssText = [
                'position:absolute', 'top:0',
                `left:${i * stripWidth}px`,
                `width:${stripWidth + 1}px`,
                'height:100%',
                `background:${paperBg}`,
                'box-shadow:inset 0 0 4px rgba(0,0,0,0.15)',
                `animation:shred-strip-fall 1.5s ease-in ${delay}ms both`,
                `--rot:${rot}deg`,
            ].join(';');
            container.appendChild(strip);
        }
        // Hide the real paper so strips are the only thing visible
        paper.style.visibility = 'hidden';
        document.body.appendChild(container);
        setTimeout(() => { container.remove(); done(); }, ANIMATION_DURATIONS.shred);
    }

    function animateBurn(paper, done) {
        paper.style.position = 'relative';
        paper.style.overflow = 'hidden';
        const fire = document.createElement('div');
        fire.className = 'anim-overlay burn-fire';
        const flicker = document.createElement('div');
        flicker.className = 'anim-overlay burn-flicker';
        paper.appendChild(fire);
        paper.appendChild(flicker);
        paper.classList.add('anim-charring');
        setTimeout(() => { paper.classList.remove('anim-charring'); done(); }, ANIMATION_DURATIONS.burn);
    }

    function animateLaser(paper, done) {
        paper.style.position = 'relative';
        paper.style.overflow = 'hidden';
        const beam = document.createElement('div');
        beam.className = 'anim-overlay laser-beam';
        paper.appendChild(beam);
        setTimeout(() => paper.classList.add('anim-laser-destroy'), LASER_SCAN_DURATION);
        setTimeout(() => { paper.classList.remove('anim-laser-destroy'); done(); }, ANIMATION_DURATIONS.laser);
    }

    function animateStamp(paper, done) {
        const rect = paper.getBoundingClientRect();
        const overlay = document.createElement('div');
        overlay.className = 'anim-overlay';
        overlay.innerHTML = '<div class="stamp-mark">VOID</div>';
        Object.assign(overlay.style, {
            position: 'fixed',
            top:  rect.top  + 'px',
            left: rect.left + 'px',
            width:  rect.width  + 'px',
            height: rect.height + 'px',
            zIndex: '9999',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        });
        document.body.appendChild(overlay);
        /* Random rotation between −30° and +20° so each stamp lands at a
           different angle, like a real rubber stamp hit off-straight. */
        const rot = Math.round((Math.random() - 0.5) * 50 - 5);
        overlay.querySelector('.stamp-mark').style.setProperty('--stamp-rot', rot + 'deg');
        paper.classList.add('anim-paper-stamped');
        setTimeout(() => {
            paper.classList.remove('anim-paper-stamped');
            overlay.remove();
            done();
        }, ANIMATION_DURATIONS.stamp);
    }

    function updatePinStatus() {
        if (currentNoteId) {
            pinNoteBtn.classList.add('pinned');
        } else {
            pinNoteBtn.classList.remove('pinned');
        }
    }

    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    const autoSave = debounce(() => {
        // Only auto-save if the note is already pinned
        if (currentNoteId && noteEditor.value) {
            saveCurrentNote();
        }
    }, 1500);

    noteEditor.addEventListener('input', autoSave);
    newNoteBtn.addEventListener('click', newNote);
    pinNoteBtn.addEventListener('click', saveCurrentNote);
    letGoBtn.addEventListener('click', triggerLetGo);
    const mainContent = document.querySelector('.main-content');

    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebar.classList.toggle('show');
    });

    mainContent.addEventListener('click', () => {
        if (sidebar.classList.contains('show')) {
            sidebar.classList.remove('show');
        }
    });
});
