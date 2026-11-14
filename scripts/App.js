(function() {
    'use strict';

    var currentState = 'home';
    var models = {};
    var scene, camera, renderer;
    var homeModelKeys = ['tricycle', 'rocket', 'phoneCase'];
    var currentHomeModel = 0;
    var homeCarouselTimer = null;
    var CONTACT_Z = -10.59;
    var HOME_GAP = 40;
    var phoneTargetGap = HOME_GAP;
    var phoneCurrentGap = HOME_GAP;
    var phoneStrapRef = null, phoneCaseRef = null;
    var phoneExtras = null;   // phone, magnets and straps added around the two printed parts
    var hand = null;        // tendon-driven hand, built by scripts/hand.js once its three STLs arrive
    var HAND_SPIN = 0.004;

    function initScene() {
        var canvas = document.getElementById('scene-canvas');
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
        camera.position.set(0, 0, 5);
        renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        renderer.setClearColor(0x000000, 0);
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        var d1 = new THREE.DirectionalLight(0xffffff, 0.8); d1.position.set(2, 3, 4); scene.add(d1);
        var d2 = new THREE.DirectionalLight(0xffffff, 0.3); d2.position.set(-2, -1, -2); scene.add(d2);
        window.addEventListener('resize', function() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
            layoutHand();
        });
        loadModels();
        animate();
    }

    var SCATTER = [[6,5,0],[-6,5,0],[6,-5,0],[-6,-5,0],[0,6,0],[0,-6,0],[5,0,3],[-5,0,-3]];
    var HOME_OPACITY = 0.25;
    var ACTIVE_OPACITY = 1.0;
    var HOME_POS = [-0.3, 0.4, 0];

    var SECTION_MODELS = {
        home: ['tricycle', 'rocket', 'phoneCase'],
        experience: [],
        projects: ['phoneCase', 'tricycle', 'hand'],
        education: [],
        contact: []
    };

    var PROJECT_POSITIONS = {
        phoneCase: [2.4, 0.8, 0],
        tricycle:  [-2.0, -0.5, 0],
        hand:      [2.35, -0.85, 0]
    };

    var EXPERIENCE_POSITIONS = {
        rocket: [1.5, 0, 0]
    };

    var HOME_SCALE = {
        tricycle: 3.5,
        rocket: 3.5,
        phoneCase: 1.4,
        hand: 2.0
    };

    function loadModels() {
        var loader = new THREE.STLLoader();
        var mat = new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, transparent: true, opacity: 0 });

        // Track which models have loaded — start carousel on first one ready
        var carouselStarted = false;
        function onModelReady() {
            if (!carouselStarted) {
                carouselStarted = true;
                // Find first loaded model and show it
                for (var i = 0; i < homeModelKeys.length; i++) {
                    if (models[homeModelKeys[i]]) {
                        currentHomeModel = i;
                        startHomeCarousel();
                        return;
                    }
                }
            }
        }

        // --- TRICYCLE (load first — it's the hero model) ---
        loader.load('./assets/models/tricycle.stl', function(geo) {
            geo.computeBoundingBox(); centerGeo(geo);
            var maxDim = getMaxDim(geo);
            var s = HOME_SCALE.tricycle / maxDim;
            var mesh = new THREE.Mesh(geo, mat.clone());
            mesh.scale.set(s, s, s);
            var spinner = new THREE.Group(); spinner.add(mesh);
            var group = new THREE.Group(); group.add(spinner);
            group.position.set(HOME_POS[0], HOME_POS[1], HOME_POS[2]);
            group.rotation.set(0.3 + Math.PI, -0.6, 0.1);
            scene.add(group);
            models.tricycle = makeModel(group, spinner, mesh, HOME_POS, 0.004);
            onModelReady();
        });

        // --- ROCKET ---
        loader.load('./assets/models/rocket.stl', function(geo) {
            geo.computeBoundingBox(); centerGeo(geo);
            var size = new THREE.Vector3(); geo.boundingBox.getSize(size);
            var maxDim = getMaxDim(geo);
            var s = HOME_SCALE.rocket / maxDim;
            var mesh = new THREE.Mesh(geo, mat.clone());
            mesh.scale.set(s, s, s);
            if (size.x >= size.y && size.x >= size.z) mesh.rotation.z = Math.PI / 2;
            else if (size.z >= size.x && size.z >= size.y) mesh.rotation.x = -Math.PI / 2;
            var spinner = new THREE.Group(); spinner.add(mesh);
            var tilt = new THREE.Group(); tilt.rotation.z = Math.PI / 3; tilt.add(spinner);
            var group = new THREE.Group(); group.add(tilt);
            group.position.set(HOME_POS[0], HOME_POS[1], HOME_POS[2]);
            scene.add(group);
            models.rocket = makeModel(group, spinner, mesh, HOME_POS, 0.012);
            models.rocket.tiltGroup = tilt;
            onModelReady();
        });

        // --- PHONE CASE ---
        var phonePartsLoaded = 0;
        var phoneCaseMesh, phoneStrapMesh;
        var phoneMat = new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150, transparent: true, opacity: 0 });

        function assemblePhone() {
            phonePartsLoaded++;
            if (phonePartsLoaded < 2) return;
            var pivot = new THREE.Group();
            var assembly = new THREE.Group();
            assembly.rotation.z = -Math.PI / 2;
            assembly.rotation.x = Math.PI;
            pivot.add(assembly);
            phoneCaseMesh.rotation.z = Math.PI;
            var midZ = (CONTACT_Z - HOME_GAP) / 2;
            phoneStrapMesh.position.z = -midZ;
            phoneCaseMesh.position.z = (CONTACT_Z - HOME_GAP) - midZ;
            assembly.add(phoneStrapMesh);
            assembly.add(phoneCaseMesh);
            phoneStrapRef = phoneStrapMesh;
            phoneCaseRef = phoneCaseMesh;
            var box = new THREE.Box3().setFromObject(pivot);
            var size = new THREE.Vector3(); box.getSize(size);
            var maxDim = Math.max(size.x, size.y, size.z);
            var s = HOME_SCALE.phoneCase / maxDim;
            pivot.scale.set(s, s, s);
            phoneExtras = addPhoneExtras(phoneCaseMesh, phoneStrapMesh, phoneMat);
            var spinner = new THREE.Group(); spinner.add(pivot);
            var group = new THREE.Group(); group.add(spinner);
            group.position.set(HOME_POS[0], HOME_POS[1], HOME_POS[2]);
            scene.add(group);
            models.phoneCase = makeModel(group, spinner, phoneCaseMesh, HOME_POS, -0.005);
            onModelReady();
        }

        loader.load('./assets/models/MagneticCase.stl', function(geo) {
            geo.computeBoundingBox();
            var c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            phoneCaseMesh = new THREE.Mesh(geo, phoneMat.clone());
            assemblePhone();
        });
        loader.load('./assets/models/MagneticStrap.stl', function(geo) {
            geo.computeBoundingBox();
            var c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            phoneStrapMesh = new THREE.Mesh(geo, phoneMat.clone());
            assemblePhone();
        });

        // --- TENDON HAND (palm + fingers + thumb, assembled and rigged in scripts/hand.js) ---
        if (window.TendonHand) {
            TendonHand.load('./assets/models/', function(parts) {
                hand = TendonHand.createSiteModel(parts, { material: mat, size: HOME_SCALE.hand });
                scene.add(hand.group);
                models.hand = makeModel(hand.group, hand.spinner, null, PROJECT_POSITIONS.hand, HAND_SPIN);
                models.hand.onDrag = hand.drag;
                layoutHand();
                hand.group.position.set(PROJECT_POSITIONS.hand[0], PROJECT_POSITIONS.hand[1], PROJECT_POSITIONS.hand[2]);
                // It is the largest download, so it can arrive after its page is already open
                if (activeProjectId === 'hand') openHandDetail();
                else if (currentState === 'projects' && !activeProjectId) gatherModel('hand');
            });
        }

    }

    // Everything in the POV rig that is not one of the two printed parts: the phone in
    // its case, the magnet pairs that snap case to chest plate, and the webbing straps.
    // Sizes and positions (mm) are read off the pockets and slots in the two STLs.
    function addPhoneExtras(caseMesh, plateMesh, baseMat) {
        function part(geo, color, shiny) {
            var m = baseMat.clone();
            m.color.setHex(color); m.shininess = shiny; if (shiny < 50) m.specular.setHex(0x222222);
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

    // Exploded layout: only three things separate - chest plate, phone, case.
    // Magnets stay in their pockets and straps stay on the plate.
    function layoutPhoneExtras(gap) {
        phoneExtras.phone.position.z = -0.85 + gap * 0.45;
    }

    function centerGeo(geo) {
        var box = geo.boundingBox;
        geo.translate(-(box.max.x+box.min.x)/2, -(box.max.y+box.min.y)/2, -(box.max.z+box.min.z)/2);
        geo.computeBoundingBox();
    }
    function getMaxDim(geo) {
        var box = geo.boundingBox;
        return Math.max(box.max.x-box.min.x, box.max.y-box.min.y, box.max.z-box.min.z);
    }
    function makeModel(group, spinner, mesh, homePos, rotSpeed) {
        return {
            group: group, spinner: spinner, mesh: mesh,
            targetPos: new THREE.Vector3(homePos[0], homePos[1], homePos[2]),
            homePos: homePos, targetOpacity: 0, rotSpeed: rotSpeed, rotAxis: 'y'
        };
    }

    // === HOME CAROUSEL ===
    var carouselTransitioning = false;

    function startHomeCarousel() {
        if (homeCarouselTimer) return;
        showHomeModel(currentHomeModel);
        homeCarouselTimer = setInterval(function() {
            if (currentState !== 'home' || carouselTransitioning) return;
            carouselTransitioning = true;
            hideAllHomeModels();
            waitUntilAllHidden(function() {
                if (currentState !== 'home') { carouselTransitioning = false; return; }
                currentHomeModel = (currentHomeModel + 1) % homeModelKeys.length;
                showHomeModel(currentHomeModel);
                carouselTransitioning = false;
            });
        }, 3500);
    }

    function waitUntilAllHidden(callback) {
        var check = setInterval(function() {
            var allGone = true;
            homeModelKeys.forEach(function(key) {
                var m = models[key];
                if (!m) return;
                m.group.traverse(function(child) {
                    if (child.isMesh) {
                        var mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(function(mt) { if (mt.opacity > 0.005) allGone = false; });
                    }
                });
            });
            if (allGone) { clearInterval(check); callback(); }
        }, 50);
    }

    function showHomeModel(idx) {
        var key = homeModelKeys[idx];
        var m = models[key];
        if (!m) return;
        m.targetPos.set(HOME_POS[0], HOME_POS[1], HOME_POS[2]);
        m.targetOpacity = HOME_OPACITY;
    }

    function hideAllHomeModels() {
        homeModelKeys.forEach(function(key) {
            var m = models[key];
            if (m) m.targetOpacity = 0;
        });
    }

    // === ANIMATION ===
    function animate() {
        requestAnimationFrame(animate);
        Object.keys(models).forEach(function(key) {
            var m = models[key];
            if (!m) return;
            m.spinner.rotation[m.rotAxis] += m.rotSpeed;
            m.group.position.lerp(m.targetPos, 0.08);

            var currentOp = 0, count = 0;
            m.group.traverse(function(child) {
                if (child.isMesh) {
                    var mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(function(mt) {
                        mt.transparent = true;
                        mt.opacity += (m.targetOpacity - mt.opacity) * 0.18;
                        if (m.targetOpacity === 0 && mt.opacity < 0.005) mt.opacity = 0;
                        currentOp += mt.opacity; count++;
                    });
                }
            });
            currentOp = count > 0 ? currentOp / count : 0;

            var maxOp = currentState === 'home' ? HOME_OPACITY : ACTIVE_OPACITY;
            var opRatio = maxOp > 0 ? Math.min(currentOp / maxOp, 1) : 0;
            var sf = 0.7 + 0.3 * opRatio;
            if (m.detailScale) sf *= m.detailScale;
            m.group.scale.lerp(new THREE.Vector3(sf, sf, sf), 0.10);
            m.group.visible = currentOp > 0.005;
        });

        if (hand) hand.update();   // finger joints, strings, explode, pose

        renderer.render(scene, camera);

        // Phone case gap + explode
        if (phoneStrapRef && phoneCaseRef) {
            // Animate gap toward target (either explode target or HOME_GAP/0)
            var gapTarget = activeProjectId === 'povcase' ? phoneExplodeTarget : phoneTargetGap;
            phoneCurrentGap += (gapTarget - phoneCurrentGap) * 0.04;
            var midZ = (CONTACT_Z - phoneCurrentGap) / 2;
            phoneStrapRef.position.z = -midZ;
            phoneCaseRef.position.z = (CONTACT_Z - phoneCurrentGap) - midZ;
            if (phoneExtras) layoutPhoneExtras(phoneCurrentGap);
        }

        // Phone spin boost decay
        if (phoneSpinBoost > 0.001) {
            phoneSpinBoost *= 0.985; // decay spin boost
            if (models.phoneCase) {
                models.phoneCase.spinner.rotation.y += phoneSpinBoost;
            }
        } else {
            phoneSpinBoost = 0;
        }

        // Rocket tilt
        if (models.rocket && models.rocket.tiltGroup) {
            var targetTilt = currentState === 'experience' ? Math.PI / 8 : Math.PI / 3;
            models.rocket.tiltGroup.rotation.z += (targetTilt - models.rocket.tiltGroup.rotation.z) * 0.04;
        }
    }

    // === SCATTER / GATHER ===
    function scatterModel(key) {
        var m = models[key];
        if (!m) return;
        // Find nearest edge based on current position
        var x = m.group.position.x;
        var y = m.group.position.y;
        var toLeft = Math.abs(x - (-5));
        var toRight = Math.abs(x - 5);
        var toTop = Math.abs(y - 4);
        var toBottom = Math.abs(y - (-4));
        var min = Math.min(toLeft, toRight, toTop, toBottom);
        if (min === toLeft) m.targetPos.set(-5, y, 0);
        else if (min === toRight) m.targetPos.set(5, y, 0);
        else if (min === toTop) m.targetPos.set(x, 4, 0);
        else m.targetPos.set(x, -4, 0);
        m.targetOpacity = 0;
    }

    function gatherModel(key) {
        var m = models[key];
        if (!m) return;
        var pp;
        if (currentState === 'experience' && EXPERIENCE_POSITIONS[key]) {
            pp = EXPERIENCE_POSITIONS[key];
        } else if (PROJECT_POSITIONS[key]) {
            pp = PROJECT_POSITIONS[key];
        } else {
            pp = m.homePos;
        }
        m.targetPos.set(pp[0], pp[1], pp[2]);
        m.targetOpacity = ACTIVE_OPACITY;
    }

    function showOnlyModels(keys) {
        Object.keys(models).forEach(function(key) {
            if (keys.indexOf(key) >= 0) gatherModel(key);
            else scatterModel(key);
        });
    }

    // === NAVIGATION ===
    function goTo(section) {
        if (section === currentState || currentState === 'transitioning') return;

        var oldSection = currentState;
        var oldState = document.querySelector('.state.active');
        currentState = 'transitioning';

        // === FADE OUT OLD STATE ===

        // Reset all animated elements
        document.querySelectorAll('.logo-item, .project-card, .edu-block, .contact-content').forEach(function(el) {
            el.classList.remove('visible');
        });

        // Reset project detail if active
        if (activeProjectId) {
            var pd = document.getElementById('project-' + activeProjectId);
            if (pd) { pd.classList.remove('active', 'visible'); }
            activeProjectId = null;
            phoneSpinBoost = 0;
            phoneExplodeTarget = 0;
            closeHandDetail();
            var pcards = document.getElementById('project-cards');
            if (pcards) pcards.style.display = '';
        }

        // Fade out models
        Object.keys(models).forEach(function(key) {
            var m = models[key];
            if (m) m.targetOpacity = 0;
        });

        // If leaving home, fade out home content
        if (oldSection === 'home') {
            var homeContent = document.querySelector('.home-content');
            var homeNavEl = document.querySelector('.home-nav');
            var homeLabel = document.querySelector('.home-label');
            var homeBg = document.getElementById('home-bg');
            [homeContent, homeNavEl, homeLabel].forEach(function(el) {
                if (el) { el.style.transition = 'opacity 0.4s ease'; el.style.opacity = '0'; }
            });
            if (homeBg) { homeBg.style.transition = 'opacity 0.4s ease'; homeBg.style.opacity = '0'; }
        }

        // If leaving a section, fade it out
        if (oldSection !== 'home' && oldState) {
            oldState.classList.add('fading-out');
            oldState.classList.remove('active');
            // Reset contact bg
            var contactBg = document.querySelector('.contact-bg');
            if (contactBg) contactBg.style.opacity = '0';
        }

        // If leaving home with models, scatter them
        if (oldSection === 'home') {
            // just fade, already set targetOpacity = 0
        } else {
            // Scatter section models to nearest edge
            Object.keys(models).forEach(function(key) {
                scatterModel(key);
            });
        }

        // === WAIT, THEN SHOW NEW STATE ===
        setTimeout(function() {
            // Clean up old state
            if (oldState) oldState.classList.remove('active', 'fading-out');
            // Kill any remaining model opacity
            Object.keys(models).forEach(function(key) {
                var m = models[key];
                if (!m) return;
                m.group.traverse(function(child) {
                    if (child.isMesh) {
                        var mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(function(mt) { mt.opacity = 0; });
                    }
                });
                m.group.visible = false;
            });
            finishGoTo(section);
        }, 600);
    }

    function finishGoTo(section) {
        currentState = section;
        document.querySelectorAll('.state').forEach(function(el) { el.classList.remove('active', 'fading-out'); });

        var topNav = document.getElementById('top-nav');
        var homeBg = document.getElementById('home-bg');

        if (section === 'home') {
            document.getElementById('state-home').classList.add('active');
            topNav.classList.remove('visible');
            phoneTargetGap = HOME_GAP;
            carouselTransitioning = false;
            currentHomeModel = 0;
            // Force all models fully invisible, then teleport
            homeModelKeys.forEach(function(key) {
                var m = models[key];
                if (!m) return;
                m.targetOpacity = 0;
                m.group.traverse(function(child) {
                    if (child.isMesh) {
                        var mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(function(mt) { mt.opacity = 0; });
                    }
                });
                m.group.visible = false;
                m.group.position.set(HOME_POS[0], HOME_POS[1], HOME_POS[2]);
                m.targetPos.set(HOME_POS[0], HOME_POS[1], HOME_POS[2]);
            });
            // Fade in home content
            var homeContent = document.querySelector('.home-content');
            var homeNav = document.querySelector('.home-nav');
            var homeLabel = document.querySelector('.home-label');
            [homeContent, homeNav, homeLabel].forEach(function(el) {
                if (!el) return;
                el.style.transition = 'none';
                el.style.opacity = '0';
            });
            // Force reflow so browser registers opacity:0
            document.body.offsetHeight;
            [homeContent, homeNav, homeLabel].forEach(function(el) {
                if (!el) return;
                el.style.transition = 'opacity 0.8s ease';
                el.style.opacity = '1';
            });
            // Background fades in too
            setTimeout(function() {
                if (homeBg) homeBg.style.opacity = '';
            }, 50);
            // Start carousel after fade in
            setTimeout(function() { showHomeModel(currentHomeModel); }, 200);
            resetDetails();
        } else {
            document.getElementById('state-' + section).classList.add('active');
            var scroll = document.querySelector('#state-' + section + ' .section-scroll');
            if (scroll) scroll.scrollTop = 0;
            topNav.classList.add('visible');
            if (homeBg) homeBg.style.opacity = '0';
            phoneTargetGap = 0;
            topNav.querySelectorAll('.top-nav-links a').forEach(function(a) {
                a.classList.toggle('active', a.dataset.section === section);
            });

            // Fade out home models gently
            homeModelKeys.forEach(function(key) {
                var m = models[key];
                if (m) m.targetOpacity = 0;
            });

            // Gather section-specific models
            var sectionModels = SECTION_MODELS[section] || [];
            sectionModels.forEach(function(key) { gatherModel(key); });

            if (section === 'experience') animateLogos();
            else if (section === 'projects') animateCards();
            else if (section === 'education') animateEdu();
            else if (section === 'contact') animateContact();
            resetDetails();
        }
    }

    // === DETAIL PANELS ===
    var activeDetailId = null;
    var rocketDragging = false;
    var rocketPrev = { x: 0, y: 0 };
    var rocketHovered = false;

    function showDetail(section, detailId) {
        var panel = document.getElementById('detail-' + detailId);
        if (!panel) return;
        activeDetailId = detailId;

        // Fade out logos first
        if (section === 'experience') {
            var items = document.querySelectorAll('#exp-logos .logo-item');
            items.forEach(function(item) { item.classList.remove('visible'); });
            // After logos fade, collapse stage and show panel
            setTimeout(function() {
                document.getElementById('exp-logos').classList.add('hidden');
                // Rocket for eclipse
                if (detailId === 'eclipse' && models.rocket) {
                    models.rocket.targetPos.set(2.5, 0, 0);
                    models.rocket.targetOpacity = ACTIVE_OPACITY;
                } else if (models.rocket) {
                    models.rocket.targetOpacity = 0;
                }
                panel.classList.add('active');
                setTimeout(function() { panel.classList.add('visible'); }, 50);
            }, 500);
        } else {
            if (detailId === 'eclipse' && models.rocket) {
                models.rocket.targetPos.set(2.5, 0, 0);
                models.rocket.targetOpacity = ACTIVE_OPACITY;
            } else if (models.rocket) {
                models.rocket.targetOpacity = 0;
            }
            panel.classList.add('active');
            setTimeout(function() { panel.classList.add('visible'); }, 50);
        }
    }

    function resetDetails() {
        document.querySelectorAll('.detail-panel').forEach(function(p) { p.classList.remove('active', 'visible', 'rocket-grabbed'); });
        var stage = document.getElementById('exp-logos');
        if (stage) stage.classList.remove('hidden');
        activeDetailId = null;
        rocketDragging = false;
        rocketHovered = false;
        document.body.style.cursor = '';
    }

    function hideDetail(section) {
        // Fade out detail panel
        document.querySelectorAll('.detail-panel').forEach(function(p) {
            p.classList.remove('visible', 'rocket-grabbed');
        });
        activeDetailId = null;
        rocketDragging = false;
        document.body.style.cursor = '';
        // Rocket scatters
        if (models.rocket) { scatterModel('rocket'); }
        // After panel fades, hide it and show logos
        setTimeout(function() {
            document.querySelectorAll('.detail-panel').forEach(function(p) { p.classList.remove('active'); });
            if (section === 'experience') animateLogos();
        }, 500);
    }

    // === ROCKET INTERACTION ===
    function setupRocketInteraction() {
        var canvas = document.getElementById('scene-canvas');
        var raycaster = new THREE.Raycaster();
        var mouse = new THREE.Vector2();

        function getRocketHit(e) {
            if (!models.rocket || activeDetailId !== 'eclipse') return false;
            var rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            var meshes = [];
            models.rocket.group.traverse(function(c) { if (c.isMesh) meshes.push(c); });
            return raycaster.intersectObjects(meshes, false).length > 0;
        }

        document.addEventListener('mousemove', function(e) {
            if (rocketDragging) {
                var dx = e.clientX - rocketPrev.x;
                var dy = e.clientY - rocketPrev.y;
                if (models.rocket && models.rocket.tiltGroup) {
                    models.rocket.tiltGroup.rotation.y += dx * 0.008;
                    models.rocket.tiltGroup.rotation.x += dy * 0.008;
                }
                rocketPrev = { x: e.clientX, y: e.clientY };
                return;
            }
            if (activeDetailId === 'eclipse') {
                rocketHovered = getRocketHit(e);
                document.body.style.cursor = rocketHovered ? 'grab' : '';
            }
        });

        document.addEventListener('mousedown', function(e) {
            if (rocketHovered && activeDetailId === 'eclipse') {
                e.preventDefault();
                rocketDragging = true;
                rocketPrev = { x: e.clientX, y: e.clientY };
                document.body.style.cursor = 'grabbing';
                if (models.rocket) { models.rocket._savedSpeed = models.rocket.rotSpeed; models.rocket.rotSpeed = 0; }
                if (models.rocket) models.rocket.targetPos.set(0.8, 0, 0);
                canvas.style.zIndex = '10';
                canvas.style.pointerEvents = 'auto';
                var panel = document.getElementById('detail-eclipse');
                if (panel) panel.classList.add('rocket-grabbed');
            }
        });

        document.addEventListener('mouseup', function() {
            if (rocketDragging) {
                rocketDragging = false;
                document.body.style.cursor = rocketHovered ? 'grab' : '';
                if (models.rocket && models.rocket._savedSpeed !== undefined) models.rocket.rotSpeed = models.rocket._savedSpeed;
                if (models.rocket) models.rocket.targetPos.set(2.5, 0, 0);
                canvas.style.zIndex = '';
                canvas.style.pointerEvents = '';
                var panel = document.getElementById('detail-eclipse');
                if (panel) panel.classList.remove('rocket-grabbed');
            }
        });
    }

    // === UI ANIMATIONS ===
    function animateLogos() {
        var items = document.querySelectorAll('#exp-logos .logo-item');
        document.getElementById('exp-logos').classList.remove('hidden');
        items.forEach(function(item) { item.classList.remove('visible'); });
        document.body.offsetHeight; // force reflow
        items.forEach(function(item, i) {
            setTimeout(function() { item.classList.add('visible'); }, 200 + i * 150);
        });
    }

    function animateCards() {
        var cards = document.querySelectorAll('#project-cards .project-card');
        cards.forEach(function(card) { card.classList.remove('visible'); });
        document.body.offsetHeight;
        cards.forEach(function(card, i) {
            setTimeout(function() { card.classList.add('visible'); }, 200 + i * 120);
        });
    }

    function animateEdu() {
        var blocks = document.querySelectorAll('.edu-block');
        blocks.forEach(function(block) { block.classList.remove('visible'); });
        document.body.offsetHeight;
        blocks.forEach(function(block, i) {
            setTimeout(function() { block.classList.add('visible'); }, 200 + i * 150);
        });
    }

    function animateContact() {
        var content = document.querySelector('.contact-content');
        var bg = document.querySelector('.contact-bg');
        if (bg) bg.style.opacity = '0';
        if (content) content.classList.remove('visible');
        document.body.offsetHeight;
        setTimeout(function() {
            if (bg) bg.style.opacity = '0.35';
            if (content) content.classList.add('visible');
        }, 200);
    }

    // === EVENTS ===
    var activeProjectId = null;
    var phoneSpinBoost = 0;
    var phoneExplodeTarget = 0;

    function initEvents() {
        document.querySelectorAll('[data-section]').forEach(function(a) {
            a.addEventListener('click', function(e) { e.preventDefault(); goTo(a.dataset.section); });
        });
        document.querySelectorAll('.logo-item[data-detail]').forEach(function(item) {
            item.addEventListener('click', function() { showDetail('experience', item.dataset.detail); });
        });
        document.querySelectorAll('.detail-back:not(.project-back)').forEach(function(btn) {
            btn.addEventListener('click', function() { hideDetail(currentState); });
        });
        // Project cards
        document.querySelectorAll('.project-card[data-project]').forEach(function(card) {
            card.addEventListener('click', function() { showProjectDetail(card.dataset.project); });
        });
        document.querySelectorAll('.project-back').forEach(function(btn) {
            btn.addEventListener('click', function() { hideProjectDetail(); });
        });
        // Explode slider
        var slider = document.getElementById('explode-range');
        if (slider) {
            slider.addEventListener('input', function() {
                phoneExplodeTarget = this.value / 100 * 80;
            });
        }
        // Tendon hand: explode view + grip
        var handExplode = document.getElementById('hand-explode-range');
        if (handExplode) {
            handExplode.addEventListener('input', function() {
                if (hand) hand.rig.setExplode(this.value / 100);
            });
        }
        var handGrip = document.getElementById('hand-grip-range');
        if (handGrip) {
            handGrip.addEventListener('input', function() {
                if (!hand) return;
                var pull = this.value / 100;
                for (var i = 0; i < 5; i++) hand.rig.setPull(i, pull);
                hand.rig.setAuto(pull > 0 ? 'off' : 'detail', 1.2);   // its own moves wait while you hold it
            });
        }
        var form = document.getElementById('contact-form');
        if (form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();
                fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json' } })
                .then(function(r) { if (r.ok) { alert("Thanks! I'll get back to you soon."); form.reset(); } });
            });
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                if (activeProjectId) hideProjectDetail();
                else if (activeDetailId) hideDetail(currentState);
                else if (currentState !== 'home') goTo('home');
            }
        });
    }

    function showProjectDetail(projectId) {
        var panel = document.getElementById('project-' + projectId);
        if (!panel) return;
        activeProjectId = projectId;

        // Fade out project cards
        document.querySelectorAll('.project-card').forEach(function(c) { c.classList.remove('visible'); });

        setTimeout(function() {
            document.getElementById('project-cards').style.display = 'none';

            if (projectId === 'hand') {
                ['phoneCase', 'tricycle'].forEach(function(key) { scatterModel(key); });
                openHandDetail();
                var canvas = document.getElementById('scene-canvas');
                canvas.style.pointerEvents = 'auto';
                canvas.style.cursor = 'grab';
            } else if (projectId === 'povcase') {
                ['tricycle', 'hand'].forEach(function(key) { scatterModel(key); });
                var m = models.phoneCase;
                if (m) {
                    m.targetPos.set(0, 0.4, 0);
                    m.targetOpacity = ACTIVE_OPACITY;
                    m.detailScale = 1.3;
                    phoneSpinBoost = 0.08;
                    phoneExplodeTarget = 56;
                    phoneTargetGap = 0;
                }
                var canvas = document.getElementById('scene-canvas');
                canvas.style.pointerEvents = 'auto';
                canvas.style.cursor = 'grab';
                var slider = document.getElementById('explode-range');
                if (slider) slider.value = 70;
            } else if (projectId === 'tricycle') {
                ['phoneCase', 'hand'].forEach(function(key) { scatterModel(key); });
                var m = models.tricycle;
                if (m) {
                    m.targetPos.set(0, 0.3, 0);
                    m.targetOpacity = ACTIVE_OPACITY;
                    m.detailScale = 1.6;
                }
                var canvas = document.getElementById('scene-canvas');
                canvas.style.pointerEvents = 'auto';
                canvas.style.cursor = 'grab';
            } else if (projectId === 'opticalmemory') {
                ['phoneCase', 'tricycle', 'hand'].forEach(function(key) { scatterModel(key); });
            } else if (projectId === 'ethicspaper') {
                ['phoneCase', 'tricycle', 'hand'].forEach(function(key) { scatterModel(key); });
            }

            panel.classList.add('active');
            document.body.offsetHeight;
            panel.classList.add('visible');

            // Init V1 model after panel is visible
            if (projectId === 'povcase') {
                setTimeout(function() {
                    setupInlineModel('v1-mount-canvas', './assets/models/iphone-mount.stl', 280, 0);
                }, 100);
                loadPovInstagram();
            }
        }, 400);
    }

    // === POV FOOTAGE ===
    // Instagram's own embed script turns the placeholder in the POV card into a live
    // preview of the profile. It is only fetched the first time the POV page opens,
    // so the rest of the site never waits on Instagram.
    var instagramRequested = false;
    function loadPovInstagram() {
        if (window.instgrm && window.instgrm.Embeds) { window.instgrm.Embeds.process(); return; }
        if (instagramRequested) return;
        instagramRequested = true;
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.instagram.com/embed.js';
        document.body.appendChild(script);
    }

    // === TENDON HAND ===
    function openHandDetail() {
        var m = models.hand;
        if (!m) return;   // still downloading: the load callback calls this again
        m.targetPos.set(hand.detailPos[0], hand.detailPos[1], hand.detailPos[2]);
        m.targetOpacity = ACTIVE_OPACITY;
        m.detailScale = hand.detailScale;
        m.rotSpeed = 0;   // it rocks in place here instead of spinning
        hand.enterDetail();
        var explode = document.getElementById('hand-explode-range');
        var grip = document.getElementById('hand-grip-range');
        if (explode) explode.value = 0;
        if (grip) grip.value = 0;
    }

    function closeHandDetail() {
        if (!hand) return;
        if (hand.open) hand.leaveDetail();
        models.hand.detailScale = null;
        models.hand.rotSpeed = HAND_SPIN;
    }

    // Keeps the hand on screen whatever the window shape
    function layoutHand() {
        if (!hand) return;
        hand.layout(camera.aspect, camera.fov, camera.position.z);
        PROJECT_POSITIONS.hand[0] = hand.listX;
        var m = models.hand;
        if (activeProjectId === 'hand') m.detailScale = hand.detailScale;
        else if (currentState === 'projects' && m.targetOpacity > 0) m.targetPos.x = hand.listX;
    }

    function hideProjectDetail() {
        var panel = document.getElementById('project-' + activeProjectId);
        if (panel) {
            panel.classList.remove('visible');
            setTimeout(function() { panel.classList.remove('active'); }, 500);
        }

        activeProjectId = null;
        phoneSpinBoost = 0;
        phoneExplodeTarget = 0;
        phoneTargetGap = 0;
        modelDragging = false;
        document.body.style.cursor = '';
        if (models.phoneCase) models.phoneCase.detailScale = null;
        if (models.tricycle) models.tricycle.detailScale = null;
        closeHandDetail();
        var canvas = document.getElementById('scene-canvas');
        canvas.style.pointerEvents = '';
        canvas.style.cursor = '';

        // Show cards again, gather project models
        setTimeout(function() {
            document.getElementById('project-cards').style.display = '';
            animateCards();
            var sectionModels = SECTION_MODELS.projects || [];
            sectionModels.forEach(function(key) { gatherModel(key); });
        }, 500);
    }

    // === INLINE MODEL VIEWERS ===
    // NOTE: fixed to size off the container's *actual* current box (via
    // ResizeObserver) instead of a one-shot snapshot at call time. Several
    // of these canvases (e.g. the antenna clamp) live inside panels that are
    // still `display:none` at DOMContentLoaded, so `parent.clientWidth /
    // clientHeight` used to read 0 and the renderer fell back to defaults —
    // while the CSS (`width:100%!important; height:100%!important;`) then
    // stretched that mis-sized canvas to fit its real box, squashing the
    // model (most noticeable on the short, wide mobile layout).
    function setupInlineModel(canvasId, stlPath, camZ, initRotY) {
        var canvas = document.getElementById(canvasId);
        if (!canvas) return;
        var parent = canvas.parentElement;

        var sc = new THREE.Scene();
        var cam = new THREE.PerspectiveCamera(45, 1, 1, 5000);
        cam.position.set(0, 0, camZ);
        var ren = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
        ren.setClearColor(0x000000, 0);

        function syncSize() {
            var w = parent.clientWidth;
            var h = parent.clientHeight;
            if (!w || !h) return; // panel still hidden — nothing to size yet
            cam.aspect = w / h;
            cam.updateProjectionMatrix();
            ren.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            ren.setSize(w, h, false);
        }

        syncSize();
        if (window.ResizeObserver) {
            new ResizeObserver(syncSize).observe(parent);
        } else {
            window.addEventListener('resize', syncSize);
        }

        sc.add(new THREE.AmbientLight(0xffffff, 0.35));
        var dl1 = new THREE.DirectionalLight(0xffffff, 0.9); dl1.position.set(2, 3, 2); sc.add(dl1);
        var dl2 = new THREE.DirectionalLight(0xffffff, 0.3); dl2.position.set(-2, -1, -2); sc.add(dl2);
        new THREE.STLLoader().load(stlPath, function(geo) {
            geo.computeBoundingBox();
            var c = new THREE.Vector3(); geo.boundingBox.getCenter(c); geo.translate(-c.x, -c.y, -c.z);
            var mesh = new THREE.Mesh(geo, new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150 }));
            mesh.rotation.x = Math.PI;
            mesh.rotation.y = initRotY || 0;
            sc.add(mesh);
            // Re-check size once the model is in — in case the panel opened
            // between call time and load completing.
            syncSize();
            var drag = false, prev = { x: 0, y: 0 };
            canvas.addEventListener('mousedown', function(e) {
                drag = true; prev = { x: e.clientX, y: e.clientY };
            });
            window.addEventListener('mousemove', function(e) {
                if (!drag) return;
                mesh.rotation.y += (e.clientX - prev.x) * 0.01;
                mesh.rotation.x += (e.clientY - prev.y) * 0.01;
                prev = { x: e.clientX, y: e.clientY };
            });
            window.addEventListener('mouseup', function() { drag = false; });
            (function anim() {
                requestAnimationFrame(anim);
                if (!drag) mesh.rotation.y += 0.005;
                ren.render(sc, cam);
            })();
        });
    }

    // === MODEL INTERACTION (POV + Tricycle detail) ===
    var modelDragging = false;
    var modelPrev = { x: 0, y: 0 };
    var activeModel = null;

    function setupModelInteraction() {
        var canvas = document.getElementById('scene-canvas');
        var raycaster = new THREE.Raycaster();
        var mouse = new THREE.Vector2();

        function getActiveModel() {
            if (activeProjectId === 'povcase') return models.phoneCase;
            if (activeProjectId === 'tricycle') return models.tricycle;
            if (activeProjectId === 'hand') return models.hand;
            return null;
        }

        function getModelHit(e) {
            var m = getActiveModel();
            if (!m) return false;
            var rect = canvas.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
            raycaster.setFromCamera(mouse, camera);
            var meshes = [];
            m.group.traverse(function(c) { if (c.isMesh) meshes.push(c); });
            return raycaster.intersectObjects(meshes, false).length > 0;
        }

        document.addEventListener('mousedown', function(e) {
            if (e.target.closest('button, input, a, iframe, .detail-role, .project-detail-controls')) return;
            if (activeProjectId && getModelHit(e)) {
                e.preventDefault();
                modelDragging = true;
                activeModel = getActiveModel();
                modelPrev = { x: e.clientX, y: e.clientY };
                document.body.style.cursor = 'grabbing';
                if (activeModel) {
                    activeModel._savedSpeed = activeModel.rotSpeed;
                    activeModel.rotSpeed = 0;
                }
            }
        });

        document.addEventListener('mousemove', function(e) {
            if (modelDragging && activeModel) {
                var dx = e.clientX - modelPrev.x;
                var dy = e.clientY - modelPrev.y;
                if (activeModel.onDrag) {
                    activeModel.onDrag(dx, dy);   // the hand turns about its own long axis
                } else {
                    activeModel.spinner.rotation.y += dx * 0.008;
                    activeModel.spinner.rotation.x += dy * 0.008;
                }
                modelPrev = { x: e.clientX, y: e.clientY };
                return;
            }
            if (activeProjectId) {
                var hit = getModelHit(e);
                document.body.style.cursor = hit ? 'grab' : '';
            }
        });

        document.addEventListener('mouseup', function() {
            if (modelDragging) {
                modelDragging = false;
                document.body.style.cursor = '';
                if (activeModel && activeModel._savedSpeed !== undefined) {
                    activeModel.rotSpeed = activeModel._savedSpeed;
                }
                activeModel = null;
            }
        });
    }

    // === LIGHTBOX ===
    var galleryImages = {
        car: ['./assets/images/car1.jpg', './assets/images/car2.jpg', './assets/images/car3.jpg']
    };
    var currentGallery = null;
    var currentGalleryIndex = 0;

    function setupLightbox() {
        var lightbox = document.getElementById('image-lightbox');
        var lightboxImg = document.getElementById('lightbox-img');
        var lightboxClose = document.querySelector('.lightbox-close');
        var prevBtn = document.querySelector('.lightbox-prev');
        var nextBtn = document.querySelector('.lightbox-next');
        var counter = document.querySelector('.lightbox-counter');

        function showNav(show) {
            prevBtn.style.display = show ? 'block' : 'none';
            nextBtn.style.display = show ? 'block' : 'none';
            counter.style.display = show ? 'block' : 'none';
        }

        function updateCounter() {
            if (currentGallery) {
                counter.textContent = (currentGalleryIndex + 1) + ' / ' + currentGallery.length;
            }
        }

        function goNext() {
            if (!currentGallery) return;
            currentGalleryIndex = (currentGalleryIndex + 1) % currentGallery.length;
            lightboxImg.src = currentGallery[currentGalleryIndex];
            updateCounter();
            updateGalleryBadge();
        }

        function goPrev() {
            if (!currentGallery) return;
            currentGalleryIndex = (currentGalleryIndex - 1 + currentGallery.length) % currentGallery.length;
            lightboxImg.src = currentGallery[currentGalleryIndex];
            updateCounter();
            updateGalleryBadge();
        }

        document.addEventListener('click', function(e) {
            var gallery = e.target.closest('.detail-gallery-preview');
            if (gallery) {
                var key = gallery.dataset.gallery;
                if (galleryImages[key]) {
                    currentGallery = galleryImages[key];
                    currentGalleryIndex = 0;
                    lightboxImg.src = currentGallery[0];
                    lightbox.classList.add('active');
                    showNav(true);
                    updateCounter();
                    return;
                }
            }
            var viewer = e.target.closest('.detail-role-media:not(.detail-role-media--model):not(.detail-role-media--videos)');
            if (viewer) {
                var img = viewer.querySelector('img');
                if (img) {
                    currentGallery = null;
                    lightboxImg.src = img.src;
                    lightbox.classList.add('active');
                    showNav(false);
                }
            }
        });

        nextBtn.addEventListener('click', function(e) { e.stopPropagation(); goNext(); });
        prevBtn.addEventListener('click', function(e) { e.stopPropagation(); goPrev(); });

        function closeLightbox() {
            lightbox.classList.remove('active');
            currentGallery = null;
            showNav(false);
        }

        if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
        if (lightbox) lightbox.addEventListener('click', function(e) { if (e.target === lightbox) closeLightbox(); });

        document.addEventListener('keydown', function(e) {
            if (!lightbox.classList.contains('active')) return;
            if (e.key === 'Escape') { closeLightbox(); e.stopPropagation(); }
            if (currentGallery) {
                if (e.key === 'ArrowRight') goNext();
                else if (e.key === 'ArrowLeft') goPrev();
            }
        });
    }

    function updateGalleryBadge() {
        var badge = document.querySelector('.detail-gallery-preview[data-gallery="car"] .media-overlay span');
        if (badge && currentGallery) {
            badge.textContent = (currentGalleryIndex + 1) + ' / ' + currentGallery.length + ' ↗';
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        initScene();
        initEvents();
        setupRocketInteraction();
        setupModelInteraction();
        setupLightbox();
        setupInlineModel('clamp-canvas', './assets/models/AntennaClamp.stl', 200, Math.PI / 2);
    });
})();