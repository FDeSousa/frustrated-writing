document.addEventListener('DOMContentLoaded', () => {
    const noteEditor = document.getElementById('note-editor');
    const pinNoteBtn = document.getElementById('pin-note');
    const letGoBtn = document.getElementById('let-go');
    const newNoteBtn = document.getElementById('new-note-btn');
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
    const ANIMATION_DURATIONS = { crumple: 1400, shred: 1400, burn: 1500, laser: 1500, stamp: 1500 };

    function triggerDestructionAnimation(callback) {
        const paper = document.querySelector('.paper');
        if (paper.dataset.animating) return false;
        paper.dataset.animating = 'true';

        const type = DESTRUCTION_ANIMATIONS[Math.floor(Math.random() * DESTRUCTION_ANIMATIONS.length)];

        const done = () => {
            delete paper.dataset.animating;
            paper.querySelectorAll('.anim-overlay').forEach(el => el.remove());
            paper.style.position = '';
            paper.style.overflow = '';
            callback();
        };

        switch (type) {
            case 'crumple': animateCrumple(paper, done); break;
            case 'shred':   animateShred(paper, done);   break;
            case 'burn':    animateBurn(paper, done);    break;
            case 'laser':   animateLaser(paper, done);   break;
            case 'stamp':   animateStamp(paper, done);   break;
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
        const COUNT = 10;
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
            const delay = i * 35 + Math.random() * 70;
            const rot   = (Math.random() - 0.5) * 28;
            strip.style.cssText = [
                'position:absolute', 'top:0',
                `left:${i * stripWidth}px`,
                `width:${stripWidth + 1}px`,
                'height:100%',
                `background:${paperBg}`,
                'box-shadow:inset 0 0 3px rgba(0,0,0,0.12)',
                `animation:shred-strip-fall 0.9s ease-in ${delay}ms both`,
                `--rot:${rot}deg`,
            ].join(';');
            container.appendChild(strip);
        }
        document.body.appendChild(container);
        setTimeout(() => { container.remove(); done(); }, ANIMATION_DURATIONS.shred);
    }

    function animateBurn(paper, done) {
        paper.style.position = 'relative';
        paper.style.overflow = 'hidden';
        const fire = document.createElement('div');
        fire.className = 'anim-overlay burn-fire';
        paper.appendChild(fire);
        paper.classList.add('anim-charring');
        setTimeout(() => { paper.classList.remove('anim-charring'); done(); }, ANIMATION_DURATIONS.burn);
    }

    function animateLaser(paper, done) {
        paper.style.position = 'relative';
        paper.style.overflow = 'hidden';
        const beam = document.createElement('div');
        beam.className = 'anim-overlay laser-beam';
        paper.appendChild(beam);
        setTimeout(() => paper.classList.add('anim-laser-destroy'), 950);
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
