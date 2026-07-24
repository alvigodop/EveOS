// Group + folder organization operations for Audioflix state. Split out of audioflix.state.js
// to keep that store under the project line cap. These are the many-to-many membership editors
// (a sound/track can sit in several groups), the music-folder rename/delete helpers, and the
// generic item patcher. They mutate the live state object in place, so the host store passes in
// its own primitives (`ensure` returns the live state, `text` coerces, `scheduleSave` persists);
// every function returns ensure() so callers get the fresh snapshot exactly as before.
window.EveAudioflixStateGroups = window.EveAudioflixStateGroups || {};

(function () {
    'use strict';

    const ns = window.EveAudioflixStateGroups;
    if (ns.ready) return;

    ns.create = function create(deps) {
        const ensure = deps.ensure;
        const text = deps.text;
        const scheduleSave = deps.scheduleSave;

        // --- Custom soundboard groups (many-to-many: a sound can sit in several groups) ---
        function addSoundboardGroup(name) {
            const state = ensure();
            const clean = text(name, '').trim();
            if (!clean) return ensure();
            state.soundboardGroups = state.soundboardGroups || [];
            if (!state.soundboardGroups.includes(clean)) state.soundboardGroups.push(clean);
            scheduleSave('audioflix-groups');
            return ensure();
        }

        function removeSoundboardGroup(name) {
            const state = ensure();
            const clean = text(name, '').trim();
            state.soundboardGroups = (state.soundboardGroups || []).filter((g) => g !== clean);
            // Strip the group from every sound's membership so we don't leave orphan tags.
            state.soundGroupMap = state.soundGroupMap || {};
            for (const id of Object.keys(state.soundGroupMap)) {
                const next = (state.soundGroupMap[id] || []).filter((g) => g !== clean);
                if (next.length) state.soundGroupMap[id] = next; else delete state.soundGroupMap[id];
            }
            scheduleSave('audioflix-groups');
            return ensure();
        }

        function toggleSoundGroup(soundId, name, on) {
            const state = ensure();
            const clean = text(name, '').trim();
            if (!soundId || !clean) return ensure();
            state.soundboardGroups = state.soundboardGroups || [];
            if (!state.soundboardGroups.includes(clean)) state.soundboardGroups.push(clean);
            state.soundGroupMap = state.soundGroupMap || {};
            const current = new Set(state.soundGroupMap[soundId] || []);
            const shouldHave = (on === undefined) ? !current.has(clean) : !!on;
            if (shouldHave) current.add(clean); else current.delete(clean);
            const next = [...current];
            if (next.length) state.soundGroupMap[soundId] = next; else delete state.soundGroupMap[soundId];
            scheduleSave('audioflix-groups');
            return ensure();
        }

        // --- Custom music groups ---
        function addMusicGroup(name) {
            const state = ensure();
            const clean = text(name, '').trim();
            if (!clean) return ensure();
            state.musicGroups = state.musicGroups || [];
            if (!state.musicGroups.includes(clean)) state.musicGroups.push(clean);
            scheduleSave('audioflix-music-groups');
            return ensure();
        }

        function removeMusicGroup(name) {
            const state = ensure();
            const clean = text(name, '').trim();
            state.musicGroups = (state.musicGroups || []).filter((g) => g !== clean);
            state.musicGroupMap = state.musicGroupMap || {};
            for (const id of Object.keys(state.musicGroupMap)) {
                const next = (state.musicGroupMap[id] || []).filter((g) => g !== clean);
                if (next.length) state.musicGroupMap[id] = next; else delete state.musicGroupMap[id];
            }
            scheduleSave('audioflix-music-groups');
            return ensure();
        }

        function toggleMusicGroup(musicId, name, on) {
            const state = ensure();
            const clean = text(name, '').trim();
            if (!musicId || !clean) return ensure();
            state.musicGroups = state.musicGroups || [];
            if (!state.musicGroups.includes(clean)) state.musicGroups.push(clean);
            state.musicGroupMap = state.musicGroupMap || {};
            const current = new Set(state.musicGroupMap[musicId] || []);
            const shouldHave = (on === undefined) ? !current.has(clean) : !!on;
            if (shouldHave) current.add(clean); else current.delete(clean);
            const next = [...current];
            if (next.length) state.musicGroupMap[musicId] = next; else delete state.musicGroupMap[musicId];
            scheduleSave('audioflix-music-groups');
            return ensure();
        }

        function updateItem(type, itemId, patch) {
            const state = ensure();
            const key = type === 'music' ? 'music' : 'soundboard';
            if (state[key]) {
                state[key] = state[key].map(entry => entry.id === itemId ? Object.assign({}, entry, patch || {}) : entry);
            }
            scheduleSave(`audioflix-update-${type}`);
            return ensure();
        }

        function renameMusicFolder(oldFolder, newFolder) {
            const state = ensure();
            const oldClean = text(oldFolder, '').trim();
            const newClean = text(newFolder, '').trim();
            if (!oldClean || !newClean || oldClean === newClean) return ensure();
            if (state.music) {
                state.music = state.music.map(entry => {
                    const currentFolder = text(entry.folder || entry.card, '');
                    if (currentFolder === oldClean) {
                        return Object.assign({}, entry, { folder: newClean, card: newClean });
                    }
                    return entry;
                });
            }
            scheduleSave('audioflix-rename-folder');
            return ensure();
        }

        function deleteMusicFolder(folderName) {
            const state = ensure();
            const clean = text(folderName, '').trim();
            if (!clean) return ensure();
            if (state.music) {
                state.music = state.music.map(entry => {
                    const currentFolder = text(entry.folder || entry.card, '');
                    if (currentFolder === clean) {
                        return Object.assign({}, entry, { folder: '', card: '' });
                    }
                    return entry;
                });
            }
            scheduleSave('audioflix-delete-folder');
            return ensure();
        }

        function renameGroup(type, oldName, newName) {
            const state = ensure();
            const oldClean = text(oldName, '').trim();
            const newClean = text(newName, '').trim();
            if (!oldClean || !newClean || oldClean === newClean) return ensure();

            const isM = type === 'music';
            const groupsKey = isM ? 'musicGroups' : 'soundboardGroups';
            const mapKey = isM ? 'musicGroupMap' : 'soundGroupMap';
            const activeKey = isM ? 'activeFrontendMusicGroup' : 'activeFrontendGroup';

            if (Array.isArray(state[groupsKey])) {
                state[groupsKey] = state[groupsKey].map(g => g === oldClean ? newClean : g);
                state[groupsKey] = [...new Set(state[groupsKey])];
            }

            if (state[mapKey] && typeof state[mapKey] === 'object') {
                Object.keys(state[mapKey]).forEach(itemId => {
                    if (Array.isArray(state[mapKey][itemId])) {
                        state[mapKey][itemId] = state[mapKey][itemId].map(g => g === oldClean ? newClean : g);
                        state[mapKey][itemId] = [...new Set(state[mapKey][itemId])];
                    }
                });
            }

            if (state[activeKey] === oldClean) {
                state[activeKey] = newClean;
            }

            scheduleSave(`audioflix-rename-group-${type}`);
            return ensure();
        }

        return {
            addSoundboardGroup,
            removeSoundboardGroup,
            toggleSoundGroup,
            addMusicGroup,
            removeMusicGroup,
            toggleMusicGroup,
            updateItem,
            renameMusicFolder,
            deleteMusicFolder,
            renameGroup
        };
    };

    ns.ready = true;
})();
