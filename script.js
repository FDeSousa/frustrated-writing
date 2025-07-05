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
            // Unpinned note with content, destroy without saving
            const paper = document.querySelector('.paper');
            if (paper.classList.contains('crumple') || paper.classList.contains('shred') || paper.classList.contains('burn')) {
                return;
            }
            const animations = ['crumple', 'shred', 'burn'];
            const randomAnimation = animations[Math.floor(Math.random() * animations.length)];
            paper.classList.add(randomAnimation);
            setTimeout(() => {
                noteEditor.value = '';
                currentNoteId = null;
                updatePinStatus();
                paper.classList.remove(randomAnimation);
            }, 1000);
        } else {
            // Pinned note or empty editor, just clear
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
        const paper = document.querySelector('.paper');
        if (paper.classList.contains('crumple') || paper.classList.contains('shred') || paper.classList.contains('burn')) {
            return;
        }

        const animations = ['crumple', 'shred', 'burn'];
        const randomAnimation = animations[Math.floor(Math.random() * animations.length)];

        paper.classList.add(randomAnimation);

        setTimeout(() => {
            deleteCurrentNote();
            paper.classList.remove(randomAnimation);
        }, 1000);
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
