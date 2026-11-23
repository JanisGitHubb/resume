/* ==========================================================================
   SITE: one scrolling page where the 3D models lead.

   How it works
   - One fixed WebGL canvas sits over the page. Every model has "anchors":
     ordinary HTML boxes marked  data-model="hand" data-size=".8" data-rot="x y z".
     Each frame a model flies to whichever of its anchors is nearest the middle
     of the screen, so it scrolls with the page and glides between spots.
   - Clicking a tile opens its "focus" panel: the page fades, the model flies to
     the big anchor at the top of that panel, and the details scroll in below.
   To add content, write normal HTML inside a .focus panel in index.html.
   ========================================================================== */
(function () {
    'use strict';

    var MODELS = './assets/models/';
    var CAMERA_Z = 5, FOV = 45;
    var VIEW_H = 2 * CAMERA_Z * Math.tan(FOV * Math.PI / 360);   // world units visible top to bottom
    var DEG = Math.PI / 180;

    var scene, camera, renderer, models = {}, focusId = null, last = 0;
    var handRig = null, phone = null;
    var belt = {}, beltRig = null, beltShift = 0;
    var BELT = { hand: 1.0, phone: 0.62, tricycle: 0.95, rocket: 0.95 };   // size on the belt, share of its height
    var BELT_ORDER = ['hand', 'tricycle', 'phone', 'rocket'];

    // ---------------------------------------------------------------- scene
    function init() {
        var canvas = document.getElementById('scene');
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(FOV, innerWidth / innerHeight, 0.1, 100);
        camera.position.set(0, 0, CAMERA_Z);
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        renderer.setSize(innerWidth, innerHeight);
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        var d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(2, 3, 4); scene.add(d1);
        var d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-2, -1, -2); scene.add(d2);
        addEventListener('resize', function () {
            camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
            renderer.setSize(innerWidth, innerHeight);
        });
        loadModels();
        requestAnimationFrame(frame);
    }

    function material() {
        var m = new THREE.MeshPhongMaterial({ color: 0xff5a1f, specular: 0x553322, shininess: 60, transparent: true, opacity: 0 });   // orange from the first frame
        m.userData.themed = true;      // colour schemes (themes.js) recolour these
        return m;
    }

    // A second copy of a model for the landing belt, with its own materials so it fades on its own.
    function addToBelt(key, object, tiltDeg) {
        object.traverse(function (o) { if (o.isMesh) o.material = o.material.clone(); });
        var spin = new THREE.Group(); spin.add(object);
        var tilt = new THREE.Group(); tilt.add(spin);
        tilt.rotation.set(tiltDeg[0] * DEG, tiltDeg[1] * DEG, tiltDeg[2] * DEG);
        var group = new THREE.Group(); group.add(tilt); group.visible = false;
        scene.add(group);
        belt[key] = { group: group, spin: spin, opacity: 0 };
    }

    // Wrap an object (already about 1 unit across, centred) so it can fly, tilt, spin and fade.
    function register(key, object) {
        var spin = new THREE.Group(); spin.add(object);
        var tilt = new THREE.Group(); tilt.add(spin);
        var group = new THREE.Group(); group.add(tilt);
        group.visible = false; group.scale.setScalar(0.001);
        scene.add(group);
        models[key] = { key: key, group: group, tilt: tilt, spin: spin, opacity: 0, placed: false,
                        want: new THREE.Quaternion(), euler: new THREE.Euler(0, 0, 0, 'YXZ'), target: new THREE.Vector3() };
        return models[key];
    }

    function loadModels() {
        var loader = new THREE.STLLoader();

        // tendon hand (rigged in hand.js)
        if (window.TendonHand) {
            TendonHand.load(MODELS, function (parts) {
                handRig = TendonHand.createRig(parts, { material: material() });
                handRig.root.scale.setScalar(1 / TendonHand.LENGTH);
                handRig.setAuto('gentle', 1.5);
                register('hand', handRig.root);
                beltRig = TendonHand.createRig(parts, { material: material() });
                beltRig.root.scale.setScalar(1 / TendonHand.LENGTH);
                beltRig.setAuto('gentle', 0.8);
                addToBelt('hand', beltRig.root, [8, 0, -8]);
            });
        }

        // POV phone rig: case + chest plate, plus phone, magnets and straps
        var got = {}, phoneMat = material();
        function buildPhone() {
            if (!got.c || !got.p) return;
            var assembly = new THREE.Group();
            assembly.rotation.z = -Math.PI / 2; assembly.rotation.x = Math.PI;
            got.c.rotation.z = Math.PI;
            assembly.add(got.p); assembly.add(got.c);
            addPhoneExtrasInto(got.c, got.p, phoneMat);
            var holder = new THREE.Group(); holder.add(assembly); holder.scale.setScalar(1 / 221);
            phone = { plate: got.p, casePart: got.c, gap: 0, want: 0 };
            layoutPhone();
            addToBelt('phone', holder.clone(true), [0, 0, 10]);
            register('phone', holder);
        }
        function centred(geo) {
            geo.computeBoundingBox(); var c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z); return geo;
        }
        loader.load(MODELS + 'MagneticCase.stl', function (g) { got.c = new THREE.Mesh(centred(g), phoneMat.clone()); buildPhone(); });
        loader.load(MODELS + 'MagneticStrap.stl', function (g) { got.p = new THREE.Mesh(centred(g), phoneMat.clone()); buildPhone(); });

        function simple(key, file, orient) {
            loader.load(MODELS + file, function (g) {
                centred(g);
                var b = g.boundingBox, size = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
                var mesh = new THREE.Mesh(g, material());
                var holder = new THREE.Group(); holder.add(mesh); holder.scale.setScalar(1 / size);
                orient(mesh, b);
                addToBelt(key, holder.clone(true), key === 'rocket' ? [0, 0, -60] : [0, 0, 0]);
                register(key, holder);
            });
        }
        simple('tricycle', 'tricycle.stl', function (mesh) { mesh.rotation.set(0.3 + Math.PI, -0.6, 0.1); });
        simple('rocket', 'rocket.stl', function (mesh, b) {            // stand it on its tail
            var x = b.max.x - b.min.x, y = b.max.y - b.min.y, z = b.max.z - b.min.z;
            if (x >= y && x >= z) mesh.rotation.z = Math.PI / 2; else if (z >= x && z >= y) mesh.rotation.x = -Math.PI / 2;
        });
    }

    // Phone, magnets and straps around the two printed parts (same as the current site)
    function addPhoneExtras(caseMesh, plateMesh, baseMat) {
        function part(geo, color, shiny) {
            var m = baseMat.clone();
            m.color.setHex(color); m.userData.themed = false; m.shininess = shiny; if (shiny < 50) m.specular.setHex(0x222222);
            return new THREE.Mesh(geo, m);
        }
        var ex = { caseMagnets: [], plateMagnets: [], straps: [] };

        function roundedRect(w, h, r) {
            var x = -w / 2, y = -h / 2, sh = new THREE.Shape();
            sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
            sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
            sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
            return sh;
        }
        function slab(w, h, r, depth) { return new THREE.ExtrudeGeometry(roundedRect(w, h, r), { depth: depth, bevelEnabled: false, curveSegments: 10 }); }

        // phone (iPhone 14 size) in the case: screen toward the chest plate, camera island
        // sitting in the case's 34.5 mm camera window
        ex.phone = part(slab(146.7, 71.5, 11, 7.8), 0x2e2e31, 110);
        ex.phone.geometry.translate(0, 0, -3.9);
        var screen = part(slab(142.5, 67.3, 9, 0.3), 0x060608, 220); screen.position.z = 3.9;
        ex.phone.add(screen);
        var island = part(slab(33, 33, 8, 1.4), 0x3a3a3e, 110); island.position.set(-55.7, 17.9, -5.3);
        ex.phone.add(island);
        [[-7.3, 7.3], [7.3, -7.3]].forEach(function(c) {
            var ring = part(new THREE.CylinderGeometry(7.4, 7.4, 2.2, 28), 0x1b1b1d, 140);
            ring.rotation.x = Math.PI / 2; ring.position.set(c[0], c[1], -0.9); island.add(ring);
            var glass = part(new THREE.CylinderGeometry(4.6, 4.6, 2.5, 28), 0x04040a, 250);
            glass.rotation.x = Math.PI / 2; glass.position.set(c[0], c[1], -1.0); island.add(glass);
        });
        var flash = part(new THREE.CylinderGeometry(2.3, 2.3, 0.6, 16), 0xd9d3ba, 60);
        flash.rotation.x = Math.PI / 2; flash.position.set(8, 8, -0.2); island.add(flash);
        caseMesh.add(ex.phone);

        // one magnet at each end of the case, and its partner in the chest plate
        [-84.95, 84.95].forEach(function(x) {
            var a = part(new THREE.BoxGeometry(15, 37, 2.8), 0x9a9a9a, 200); a.position.set(x, 0, 5.4);
            caseMesh.add(a); ex.caseMagnets.push(a);
            var b = part(new THREE.BoxGeometry(16.5, 40, 2.6), 0x9a9a9a, 200); b.position.set(x, -0.2, -1.9);
            plateMesh.add(b); ex.plateMagnets.push(b);
        });

        // webbing, as wide as the slot it threads through (38 mm shoulder slots, 99.5 mm
        // waist slots), curving back around the body; shoulder straps carry an adjuster buckle
        function strap(x, y, angle, width, length, buckle) {
            var g = new THREE.Group(); g.position.set(x, y, 2.2); g.rotation.z = angle;
            var SEG = 7, piece = length / SEG, at = g;
            for (var i = 0; i < SEG; i++) {
                var joint = new THREE.Group();
                joint.position.x = i === 0 ? 0 : piece;
                joint.rotation.y = i === 0 ? 0 : -0.012 * i * i;          // gentle curve back toward the body
                var web = part(new THREE.BoxGeometry(piece + 0.6, width, 1.5), 0x151515, 10); web.position.x = piece / 2;
                joint.add(web);
                if (buckle && i === 2) {
                    var frame = part(new THREE.BoxGeometry(11, width + 9, 3.6), 0x2c2c2c, 80); frame.position.set(piece / 2, 0, 0.4);
                    var bar = part(new THREE.BoxGeometry(3, width + 2, 4.6), 0x3a3a3a, 80); bar.position.set(piece / 2, 0, 0.6);
                    joint.add(frame); joint.add(bar);
                }
                at.add(joint); at = joint;
            }
            plateMesh.add(g);
            ex.straps.push({ group: g, x: x, y: y, dx: Math.cos(angle), dy: Math.sin(angle) });
        }
        strap(93.5, 39.3, 0.66, 36, 120, true);
        strap(93.5, -39.3, -0.66, 36, 120, true);
        strap(13.5, 52, Math.PI / 2, 96, 95, false);
        strap(13.5, -52, -Math.PI / 2, 96, 95, false);
        return ex;
    }


    var CONTACT_Z = -10.59, phoneExtras = null;
    function addPhoneExtrasInto(c, p, m) { phoneExtras = addPhoneExtras(c, p, m); }
    function layoutPhone() {
        var mid = (CONTACT_Z - phone.gap) / 2;
        phone.plate.position.z = -mid;
        phone.casePart.position.z = (CONTACT_Z - phone.gap) - mid;
        phoneExtras.phone.position.z = -0.85 + phone.gap * 0.45;      // phone floats between case and plate
    }

    // ------------------------------------------------------------ anchors
    function anchorFor(key) {
        var list = document.querySelectorAll('[data-model="' + key + '"]'), best = null, bestGap = Infinity;
        for (var i = 0; i < list.length; i++) {
            var el = list[i], panel = el.closest('.focus');
            if (focusId ? !(panel && panel.classList.contains('on')) : !!panel) continue;
            var r = el.getBoundingClientRect();
            if (!r.width || !r.height) continue;
            var gap = Math.abs(r.top + r.height / 2 - innerHeight / 2);
            if (gap < bestGap) { bestGap = gap; best = { el: el, r: r }; }
        }
        return best;
    }

    function frame(now) {
        requestAnimationFrame(frame);
        var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016; last = now;
        var ppu = innerHeight / VIEW_H, ease = 1 - Math.exp(-7 * dt);

        Object.keys(models).forEach(function (key) {
            var m = models[key], a = anchorFor(key), wantOpacity = 0;
            if (a) {
                var d = a.el.dataset, rot = (d.rot || '0 0 0').split(' ');
                var size = (parseFloat(d.size) || 0.8) * Math.min(a.r.width, a.r.height) / ppu;
                m.target.set((a.r.left + a.r.width / 2 - innerWidth / 2) / ppu, -(a.r.top + a.r.height / 2 - innerHeight / 2) / ppu, 0);
                m.euler.set(rot[0] * DEG, rot[1] * DEG, rot[2] * DEG); m.want.setFromEuler(m.euler);
                if (!m.placed || m.opacity < 0.05) { m.anchor = a.el; m.fly = 1; m.placed = true; m.group.position.copy(m.target); m.group.scale.setScalar(size); m.tilt.quaternion.copy(m.want); }
                if (a.el !== m.anchor) { m.anchor = a.el; m.fly = 0; }
                if (m.fly < 1) {                                   // flying between a tile and the zoomed view
                    m.fly = Math.min(1, m.fly + dt / 0.8);
                    m.group.position.lerp(m.target, ease);
                    m.group.scale.setScalar(m.group.scale.x + (size - m.group.scale.x) * ease);
                    m.tilt.quaternion.slerp(m.want, ease * 0.7);
                } else {                                           // otherwise glued to its box
                    m.group.position.copy(m.target);
                    m.group.scale.setScalar(size);
                    m.tilt.quaternion.slerp(m.want, ease * 0.7);
                }
                if (!m.dragging) m.spin.rotation.y += (parseFloat(d.spin) || 0) * dt;
                wantOpacity = 1;
            }
            m.opacity += (wantOpacity - m.opacity) * (1 - Math.exp(-6 * dt));
            if (m.opacity < 0.004) m.opacity = 0;
            m.group.visible = m.opacity > 0;
            m.group.traverse(function (o) { if (o.isMesh) { o.material.transparent = true; o.material.opacity = m.opacity; } });
        });

        // landing belt: copies of the models drifting left to right in a loop, behind the name
        var hero = document.getElementById('top').getBoundingClientRect(), strip = document.getElementById('belt').getBoundingClientRect();
        var beltH = strip.height, slot = beltH * 1.25, n = BELT_ORDER.length;
        var loop = Math.max(n * slot, innerWidth + slot), gapPx = loop / n, beltOn = !focusId && hero.bottom > 0;
        beltShift = (beltShift + dt * 55) % loop;
        BELT_ORDER.forEach(function (key, i) {
            var b = belt[key]; if (!b) return;
            var x = (beltShift + i * gapPx) % loop - slot / 2;
            b.group.position.set((x - innerWidth / 2) / ppu, -(strip.top + beltH / 2 - innerHeight / 2) / ppu, -0.4);
            b.group.scale.setScalar(beltH * BELT[key] / ppu);
            b.spin.rotation.y += 0.35 * dt;
            b.opacity += ((beltOn ? 1 : 0) - b.opacity) * (1 - Math.exp(-6 * dt));
            b.group.visible = b.opacity > 0.004;
            b.group.traverse(function (o) { if (o.isMesh) { o.material.transparent = true; o.material.opacity = b.opacity; } });
        });
        if (beltRig) beltRig.update(dt);

        if (handRig) handRig.update(dt);
        if (phone) { phone.gap += (phone.want - phone.gap) * (1 - Math.exp(-3 * dt)); layoutPhone(); }
        renderer.render(scene, camera);
    }

    // -------------------------------------------------------------- focus
    function openFocus(id) {
        var panel = document.getElementById('focus-' + id);
        if (!panel) return;
        document.querySelectorAll('.focus.on').forEach(function (p) { p.classList.remove('on'); });
        panel.classList.add('on');
        focusId = id;
        document.body.classList.add('focus-open');
        document.getElementById('focus-layer').scrollTop = 0;
        Object.keys(models).forEach(function (k) { models[k].spin.rotation.x = 0; });
        if (id === 'hand' && handRig) { models.hand && (models.hand.spin.rotation.y = 0); handRig.burst(); handRig.setAuto('detail', 1.6); setRange('hand-explode-range', 0); setRange('hand-grip-range', 0); handRig.setExplode(0); }
        if (id === 'povcase') { if (phone) phone.want = 56; setRange('explode-range', 70); loadInstagram(); inlineModel('v1-mount-canvas', 'iphone-mount.stl', 280, 0); }
        if (id === 'eclipse') inlineModel('clamp-canvas', 'Antennaclamp.stl', 200, Math.PI / 2);
    }
    function closeFocus() {
        if (!focusId) return;
        focusId = null;
        document.body.classList.remove('focus-open');
        if (handRig) { handRig.setExplode(0); for (var i = 0; i < 5; i++) handRig.setPull(i, 0); handRig.setAuto('gentle', 1.5); }
        if (phone) phone.want = 0;
    }
    function setRange(id, v) { var el = document.getElementById(id); if (el) el.value = v; }

    function wire() {
        document.querySelectorAll('[data-open]').forEach(function (el) {
            el.addEventListener('click', function (e) { e.preventDefault(); openFocus(el.dataset.open); });
        });
        document.getElementById('focus-back').addEventListener('click', closeFocus);
        document.querySelectorAll('[data-goto]').forEach(function (a) {
            a.addEventListener('click', function (e) {
                e.preventDefault(); closeFocus();
                var t = document.getElementById(a.dataset.goto);
                if (t) window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 40, behavior: 'smooth' });
            });
        });
        var bar = document.querySelector('.bar');
        function solid() { bar.classList.toggle('solid', window.scrollY > innerHeight * 0.6 || !!focusId); }
        addEventListener('scroll', solid, { passive: true }); setInterval(solid, 300);

        // sliders
        on('hand-explode-range', function (v) { if (handRig) handRig.setExplode(v); });
        on('hand-grip-range', function (v) { if (!handRig) return; for (var i = 0; i < 5; i++) handRig.setPull(i, v); handRig.setAuto(v > 0 ? 'off' : 'detail', 1.2); });
        on('explode-range', function (v) { if (phone) phone.want = v * 80; });

        // drag the big model in a focus panel to turn it
        var drag = null;
        document.addEventListener('pointerdown', function (e) {
            var stage = e.target.closest('.focus-stage[data-model]');
            if (!stage || !models[stage.dataset.model]) return;
            drag = { m: models[stage.dataset.model], x: e.clientX, y: e.clientY }; drag.m.dragging = true;
        });
        addEventListener('pointermove', function (e) {
            if (!drag) return;
            drag.m.spin.rotation.y += (e.clientX - drag.x) * 0.008; drag.m.spin.rotation.x += (e.clientY - drag.y) * 0.008;
            drag.x = e.clientX; drag.y = e.clientY;
        });
        function drop() { if (drag) { drag.m.dragging = false; drag = null; } }
        addEventListener('pointerup', drop); addEventListener('pointercancel', drop);

        document.addEventListener('keydown', function (e) {
            if (e.key !== 'Escape') return;
            if (closeLightboxes()) return;
            closeFocus();
        });
        lightboxes(); contactForm();
    }
    function on(id, fn) { var el = document.getElementById(id); if (el) el.addEventListener('input', function () { fn(this.value / 100); }); }

    // ------------------------------------------- the smaller page features
    var instagramAsked = false;
    function loadInstagram() {
        if (window.instgrm && window.instgrm.Embeds) { window.instgrm.Embeds.process(); return; }
        if (instagramAsked) return; instagramAsked = true;
        var s = document.createElement('script'); s.async = true; s.src = 'https://www.instagram.com/embed.js'; document.body.appendChild(s);
    }

    var inlineDone = {};
    function inlineModel(canvasId, file, camZ, rotY) {       // the small turnable models inside cards
        var canvas = document.getElementById(canvasId);
        if (!canvas || inlineDone[canvasId]) return; inlineDone[canvasId] = true;
        var box = canvas.parentElement, sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(45, 1, 1, 5000);
        cam.position.set(0, 0, camZ);
        var ren = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true }); ren.setClearColor(0x000000, 0);
        function fit() { var w = box.clientWidth, h = box.clientHeight; if (!w || !h) return; cam.aspect = w / h; cam.updateProjectionMatrix(); ren.setPixelRatio(Math.min(devicePixelRatio, 2)); ren.setSize(w, h, false); }
        fit(); if (window.ResizeObserver) new ResizeObserver(fit).observe(box);
        sc.add(new THREE.AmbientLight(0xffffff, 0.35));
        var l1 = new THREE.DirectionalLight(0xffffff, 0.9); l1.position.set(2, 3, 2); sc.add(l1);
        var l2 = new THREE.DirectionalLight(0xffffff, 0.3); l2.position.set(-2, -1, -2); sc.add(l2);
        new THREE.STLLoader().load(MODELS + file, function (g) {
            g.computeBoundingBox(); var c = new THREE.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z);
            var mesh = new THREE.Mesh(g, new THREE.MeshPhongMaterial({ color: 0xff5a1f, specular: 0x553322, shininess: 60 }));   // same orange as the main models
            mesh.rotation.x = Math.PI; mesh.rotation.y = rotY; sc.add(mesh);
            var held = null;
            canvas.addEventListener('pointerdown', function (e) { held = { x: e.clientX, y: e.clientY }; });
            addEventListener('pointermove', function (e) { if (!held) return; mesh.rotation.y += (e.clientX - held.x) * 0.01; mesh.rotation.x += (e.clientY - held.y) * 0.01; held = { x: e.clientX, y: e.clientY }; });
            addEventListener('pointerup', function () { held = null; });
            (function spin() { requestAnimationFrame(spin); if (!held) mesh.rotation.y += 0.005; ren.render(sc, cam); })();
        });
    }

    var closers = [];
    function closeLightboxes() { var any = false; closers.forEach(function (c) { if (c()) any = true; }); return any; }
    function lightboxes() {
        // images
        var box = document.getElementById('image-lightbox'), img = document.getElementById('lightbox-img');
        var prev = box.querySelector('.lightbox-prev'), next = box.querySelector('.lightbox-next'), count = box.querySelector('.lightbox-counter');
        var sets = { car: ['./assets/images/car1.jpg', './assets/images/car2.jpg', './assets/images/car3.jpg'] }, set = null, at = 0;
        function show() { img.src = set ? set[at] : img.src; count.textContent = set ? (at + 1) + ' / ' + set.length : ''; [prev, next, count].forEach(function (el) { el.style.display = set ? 'block' : 'none'; }); box.classList.add('active'); }
        function shut() { if (!box.classList.contains('active')) return false; box.classList.remove('active'); set = null; return true; }
        document.addEventListener('click', function (e) {
            var g = e.target.closest('.detail-gallery-preview');
            if (g && sets[g.dataset.gallery]) { set = sets[g.dataset.gallery]; at = 0; show(); return; }
            var v = e.target.closest('.detail-role-media:not(.detail-role-media--model)');
            if (v && v.querySelector('img')) { set = null; img.src = v.querySelector('img').src; show(); }
        });
        next.addEventListener('click', function (e) { e.stopPropagation(); at = (at + 1) % set.length; show(); });
        prev.addEventListener('click', function (e) { e.stopPropagation(); at = (at + set.length - 1) % set.length; show(); });
        box.addEventListener('click', function (e) { if (e.target === box || e.target.classList.contains('lightbox-close')) shut(); });
        closers.push(shut);

        // papers
        var pdf = document.getElementById('pdf-lightbox'), pframe = document.getElementById('pdf-lightbox-iframe');
        function shutPdf() { if (!pdf.classList.contains('active')) return false; pdf.classList.remove('active'); setTimeout(function () { pframe.src = ''; }, 300); return true; }
        document.querySelectorAll('.pdf-expand-btn').forEach(function (b) {
            b.addEventListener('click', function (e) { e.stopPropagation(); pframe.src = b.parentElement.querySelector('iframe').getAttribute('src'); pdf.classList.add('active'); });
        });
        pdf.addEventListener('click', function (e) { if (e.target === pdf || e.target.id === 'pdf-lightbox-close') shutPdf(); });
        closers.push(shutPdf);
    }

    function contactForm() {
        var form = document.getElementById('contact-form');
        if (!form) return;
        form.addEventListener('submit', function (e) {
            e.preventDefault();
            fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
                .then(function (r) { if (r.ok) { alert("Thanks! I'll get back to you soon."); form.reset(); } });
        });
    }

    window.V2 = { scene: function () { return scene; } };
    document.addEventListener('DOMContentLoaded', function () { init(); wire(); });
})();
