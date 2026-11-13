/* ==========================================================================
   TENDON-DRIVEN HAND  -  articulated 3D model for the Projects page

   Loads the three CAD exports already sitting in assets/models/

       Slenderman.stl          palm + the four enclosed string channels
       SlendermanFingers.stl   4 fingers x 3 phalanges
       SlendermanThumb.stl     thumb base link + thumb tip

   splits each file into its separate printed bodies, moves every body to
   where it physically sits in the assembled hand and rigs all 14 hinges.

   Public API (window.TendonHand):
       load(basePath, callback)          -> callback(parts)
       createRig(parts, options)         -> the articulated hand
       createSiteModel(parts, config)    -> the hand wrapped for the main scene
   ========================================================================== */
(function (global) {
    'use strict';

    var THREE = global.THREE;
    if (!THREE) return;

    // ======================================================================
    // 1. WHAT THE CAD SAYS
    //    Everything below is in millimetres in one "hand frame":
    //        +X toward the thumb   +Y toward the fingertips   +Z out of the palm
    // ======================================================================

    var FILES = { palm: 'Slenderman.stl', fingers: 'SlendermanFingers.stl', thumb: 'SlendermanThumb.stl' };

    // The three STLs are exported in three different poses. These put them back
    // together. They come straight from the hinge holes:
    //   - the knuckle rod bore in the fingers (y 13, z 50) lines up with the
    //     rod holes in the palm lugs (y -15, z -115)
    //   - the thumb's pivot eye sits centred between the two ears of the mount
    function palmToHand(x, y, z, o, i)   { o[i] = x;         o[i + 1] = -z;     o[i + 2] = y; }
    function fingerToHand(x, y, z, o, i) { o[i] = x;         o[i + 1] = z + 65; o[i + 2] = -y - 2; }
    function thumbToHand(x, y, z, o, i)  { o[i] = 15.83 - x; o[i + 1] = z + 65; o[i + 2] = y; }

    var LENGTH = 412;                  // wrist stub to middle fingertip
    var CENTER = [4, 146, -9];         // what the model turns around: mid-fingers, in the palm plane

    // Fingers, in the order pinky, ring, middle, index. Hinge axes all run along X.
    var FINGER_X = [-32.5, -9, 14.5, 39.5];
    var MCP = [115, -15];                                    // [Y, Z] knuckle rod (8.8 mm bore)
    var PIP = [194.08, -13.59];                              // 3 mm pin
    var DIP_Y = [258.74, 263.44, 268.44, 263.44], DIP_Z = -13.08;
    var TIP_Y = [315.28, 331.09, 339.91, 334.71];            // string tie-off hole near each tip
    var HOOK_MID_Y = [242.24, 247.24, 252.24, 247.24];       // rubber-band hooks on the back
    var HOOK_TIP_Y = [272.14, 277.14, 282.14, 277.14];

    // Thumb: both hinges are parallel, tilted out of the palm.
    var THUMB = {
        cmc:  [52.755, 65.815, 25.145],      // pivot bolt through the mount
        ip:   [95.655, 95.125, 64.195],      // base link -> tip
        axis: [-0.73181, 0.20615, 0.64958],
        v1:   [0.66005, 0.45096, 0.60081],   // direction of the base link
        v2:   [0.59194, 0.77182, 0.23216],   // direction of the tip
        n1:   [-0.16907, 0.86843, -0.46609], // string side of the base link
        n2:   [-0.45349, 0.55441, -0.68686], // string side of the tip
        hookBase: [69.0, 59.4, 45.2], hookKnuckle: [96.48, 80.66, 69.4], hookTip: [115.34, 115.74, 79.53],
        bandAnchor: [56.2, 36.8, 23.8],      // on the mount, below the thumb
        // the thumb's own string tunnel: in at the wrist end of the mount, curving up through it,
        // out of the 3 mm hole in the back wall of the pocket the thumb sits in
        tunnel: [[31.6, 24.5, 2.4], [32.0, 30, 2.7], [32.9, 42, 3.8], [34.3, 54, 5.5], [36.1, 62, 7.5], [37.6, 66.5, 9.4]],
        hole: [40.36, 70.78, 12.4], holeAxis: [0.663, -0.006, 0.749]
    };

    // Centre-lines of the four string channels on the palm, wrist end first: [X, Y]
    var CHANNELS = [
        [[-20.07, -31.59], [-20.27, 52.83], [-22.56, 61.77], [-28.96, 74.69], [-31.66, 81.64], [-33.28, 88.59], [-33.68, 96.54]],
        [[-8.34, -31.44], [-8.31, 49.91], [-9.13, 60.82], [-12.35, 79.67], [-12.32, 96.54]],
        [[11.75, -31.74], [11.96, 96.54]],
        [[20.04, -31.6], [20.04, 51.85], [20.88, 56.82], [23.11, 62.78], [31.13, 76.69], [33.34, 81.66], [35.06, 88.61], [35.69, 96.56]]
    ];
    var CHANNEL_Z = -4.4;

    // How far each hinge can swing before printed parts touch (degrees, measured
    // by sweeping the meshes against each other). Every hinge has a hard stop at 0.
    //     knuckle 0-125   middle joint 0-107   tip joint 0-98   thumb base 0-70   thumb tip 0-50
    // A full pull uses most of that, staying clear of the palm and the thumb mount:
    var FLEX = [[62, 98, 76], [62, 98, 76], [62, 98, 76], [58, 96, 62]];
    var THUMB_FLEX = [36, 40];

    var TENDON_COLOR = 0x5d9c7c;   // the strings (sage, like the real line)
    var BAND_COLOR = 0xc2a274;     // rubber bands on the back of each joint

    var DEG = Math.PI / 180;
    var NAMES = ['pinky', 'ring', 'middle', 'index', 'thumb'];

    // ======================================================================
    // 2. LOADING: three files -> 19 separate bodies in the hand frame
    // ======================================================================

    var cache = null, waiting = [], loading = false;

    function load(basePath, callback) {
        if (cache) { callback(cache); return; }
        waiting.push(callback);
        if (loading) return;
        loading = true;
        var loader = new THREE.STLLoader(), got = {}, left = 3;
        function fetch(key, toHand) {
            loader.load(basePath + FILES[key], function (geometry) {
                got[key] = splitBodies(geometry, toHand);
                if (--left > 0) return;
                cache = sortBodies(got);
                waiting.splice(0).forEach(function (cb) { cb(cache); });
            }, undefined, function () {
                if (global.console) console.warn('[TendonHand] could not load ' + basePath + FILES[key]);
            });
        }
        fetch('palm', palmToHand);
        fetch('fingers', fingerToHand);
        fetch('thumb', thumbToHand);
    }

    // An STL is just loose triangles. Bodies that do not share a vertex are
    // separate parts, so: weld identical corners, then flood-fill.
    function splitBodies(geometry, toHand) {
        var src = geometry.attributes.position.array;
        var nsrc = geometry.attributes.normal ? geometry.attributes.normal.array : null;
        var nv = src.length / 3, nt = nv / 3, i, k;

        var ids = new Int32Array(nv), seen = new Map(), count = 0;
        for (i = 0; i < nv; i++) {
            // 0.01 mm grid, coordinates within +-500 mm -> 17 bits per axis, exact in a double
            k = ((Math.round(src[3 * i] * 100) + 50000) * 131072 + (Math.round(src[3 * i + 1] * 100) + 50000)) * 131072 +
                (Math.round(src[3 * i + 2] * 100) + 50000);
            var id = seen.get(k);
            if (id === undefined) { id = count++; seen.set(k, id); }
            ids[i] = id;
        }

        var parent = new Int32Array(count);
        for (i = 0; i < count; i++) parent[i] = i;
        function find(a) { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; }
        for (i = 0; i < nt; i++) {
            var a = find(ids[3 * i]);
            var b = find(ids[3 * i + 1]); if (b !== a) parent[b] = a;
            var c = find(ids[3 * i + 2]); if (c !== a) parent[c] = a;
        }

        var slot = new Map(), sizes = [], triBody = new Int32Array(nt);
        for (i = 0; i < nt; i++) {
            var r = find(ids[3 * i]), s = slot.get(r);
            if (s === undefined) { s = sizes.length; slot.set(r, s); sizes.push(0); }
            triBody[i] = s; sizes[s]++;
        }

        var bodies = sizes.map(function (n) {
            return { tris: n, pos: new Float32Array(n * 9), nor: new Float32Array(n * 9), fill: 0,
                     min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
        });
        var origin = [0, 0, 0];
        toHand(0, 0, 0, origin, 0);
        for (i = 0; i < nt; i++) {
            var body = bodies[triBody[i]], o = body.fill;
            for (k = 0; k < 3; k++) {
                var v = 3 * (3 * i + k), w = o + 3 * k;
                toHand(src[v], src[v + 1], src[v + 2], body.pos, w);
                if (nsrc) {                                   // normals rotate but do not translate
                    toHand(nsrc[v], nsrc[v + 1], nsrc[v + 2], body.nor, w);
                    body.nor[w] -= origin[0]; body.nor[w + 1] -= origin[1]; body.nor[w + 2] -= origin[2];
                }
                for (var ax = 0; ax < 3; ax++) {
                    if (body.pos[w + ax] < body.min[ax]) body.min[ax] = body.pos[w + ax];
                    if (body.pos[w + ax] > body.max[ax]) body.max[ax] = body.pos[w + ax];
                }
            }
            body.fill += 9;
        }

        return bodies.map(function (bd) {
            var g = new THREE.BufferGeometry();
            g.setAttribute('position', new THREE.BufferAttribute(bd.pos, 3));
            if (nsrc) g.setAttribute('normal', new THREE.BufferAttribute(bd.nor, 3)); else g.computeVertexNormals();
            g.computeBoundingBox(); g.computeBoundingSphere();
            return { geometry: g, tris: bd.tris, min: bd.min, max: bd.max,
                     mid: [(bd.min[0] + bd.max[0]) / 2, (bd.min[1] + bd.max[1]) / 2, (bd.min[2] + bd.max[2]) / 2] };
        });
    }

    // Work out which body is which, by size and position.
    function sortBodies(got) {
        var all = got.palm.concat(got.fingers, got.thumb).map(function (b) { return b.geometry; });
        if (got.palm.length !== 5 || got.fingers.length !== 12 || got.thumb.length !== 2) {
            if (global.console) console.warn('[TendonHand] unexpected part count (' + got.palm.length + '/' + got.fingers.length + '/' +
                got.thumb.length + ', expected 5/12/2). Showing the hand without moving joints.');
            return { articulated: false, all: all };
        }
        var palm = got.palm.slice().sort(function (a, b) { return b.tris - a.tris; });
        var channels = palm.slice(1).sort(function (a, b) { return a.mid[0] - b.mid[0]; });

        var byX = got.fingers.slice().sort(function (a, b) { return a.mid[0] - b.mid[0]; });
        var fingers = [0, 1, 2, 3].map(function (f) {
            return byX.slice(f * 3, f * 3 + 3).sort(function (a, b) { return a.min[1] - b.min[1]; })
                      .map(function (b) { return b.geometry; });
        });

        function gap(b) { return Math.abs(b.mid[0] - THUMB.cmc[0]) + Math.abs(b.mid[1] - THUMB.cmc[1]) + Math.abs(b.mid[2] - THUMB.cmc[2]); }
        var thumb = got.thumb.slice().sort(function (a, b) { return gap(a) - gap(b); });

        return {
            articulated: true, all: all,
            palm: palm[0].geometry,
            channels: channels.map(function (b) { return b.geometry; }),
            fingers: fingers,                                   // [finger][proximal, middle, distal]
            thumb: [thumb[0].geometry, thumb[1].geometry]       // [base link, tip]
        };
    }

    // ======================================================================
    // 3. SMALL HELPERS
    // ======================================================================

    function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
    function ease(v) { v = clamp01(v); return v * v * (3 - 2 * v); }
    function approach(current, target, rate, dt) { return current + (target - current) * (1 - Math.exp(-rate * dt)); }
    function pulse(t, rise, hold, fall) {
        if (t <= 0) return 0;
        if (t < rise) return ease(t / rise);
        if (t < rise + hold) return 1;
        if (t < rise + hold + fall) return 1 - ease((t - rise - hold) / fall);
        return 0;
    }
    function add(a, b, s) { return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s]; }

    // A bundle of thin round strings whose corner points move every frame.
    function Strands(counts, radius, material) {
        var SIDES = 6, total = 0, i, s, j;
        for (i = 0; i < counts.length; i++) total += counts[i];
        var pos = new Float32Array(total * SIDES * 3), nor = new Float32Array(total * SIDES * 3), index = [], base = 0;
        for (i = 0; i < counts.length; i++) {
            for (s = 0; s < counts[i] - 1; s++) for (j = 0; j < SIDES; j++) {
                var a = (base + s) * SIDES + j, b = (base + s) * SIDES + (j + 1) % SIDES, c = a + SIDES, d = b + SIDES;
                index.push(a, b, c, b, d, c);
            }
            base += counts[i];
        }
        var geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        geometry.setIndex(index);
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.frustumCulled = false;
        this.mesh.raycast = function () {};
        this.points = new Float32Array(total * 3);   // fill this, then call commit()
        this.radius = radius;
        var P = this.points, self = this;

        this.commit = function () {
            var r = self.radius, start = 0, n, k, q, tx, ty, tz, len, bx, by, bz, nx, ny, nz, ca, sa, o;
            for (i = 0; i < counts.length; i++) {
                n = counts[i];
                for (s = 0; s < n; s++) {
                    k = 3 * (start + s);
                    var k0 = 3 * (start + (s > 0 ? s - 1 : 0)), k1 = 3 * (start + (s < n - 1 ? s + 1 : n - 1));
                    tx = P[k1] - P[k0]; ty = P[k1 + 1] - P[k0 + 1]; tz = P[k1 + 2] - P[k0 + 2];
                    len = Math.sqrt(tx * tx + ty * ty + tz * tz) || 1; tx /= len; ty /= len; tz /= len;
                    if (Math.abs(tx) < 0.85) { bx = 0; by = tz; bz = -ty; }      // t x (1,0,0)
                    else { bx = ty; by = -tx; bz = 0; }                           // t x (0,0,1)
                    len = Math.sqrt(bx * bx + by * by + bz * bz) || 1; bx /= len; by /= len; bz /= len;
                    nx = by * tz - bz * ty; ny = bz * tx - bx * tz; nz = bx * ty - by * tx;
                    for (q = 0; q < SIDES; q++) {
                        ca = Math.cos(q / SIDES * 6.283185307); sa = Math.sin(q / SIDES * 6.283185307);
                        o = 3 * ((start + s) * SIDES + q);
                        nor[o] = ca * nx + sa * bx; nor[o + 1] = ca * ny + sa * by; nor[o + 2] = ca * nz + sa * bz;
                        pos[o] = P[k] + r * nor[o]; pos[o + 1] = P[k + 1] + r * nor[o + 1]; pos[o + 2] = P[k + 2] + r * nor[o + 2];
                    }
                }
                start += n;
            }
            geometry.attributes.position.needsUpdate = true;
            geometry.attributes.normal.needsUpdate = true;
        };
    }

    // ======================================================================
    // 4. THE RIG
    // ======================================================================

    function createRig(parts, options) {
        options = options || {};
        var proto = options.material || new THREE.MeshPhongMaterial({ color: 0x555555, specular: 0xCCCCCC, shininess: 150 });
        var prefix = options.tendonPrefix || null;          // optional extra string before the palm
        var prefixCount = prefix ? (options.tendonPrefixCount || 0) : 0;

        var root = new THREE.Group(), frame = new THREE.Group();
        root.add(frame);
        if (options.centered !== false) frame.position.set(-CENTER[0], -CENTER[1], -CENTER[2]);

        var solids = [];
        function solid(geometry) { var m = new THREE.Mesh(geometry, proto.clone()); solids.push(m); return m; }

        var rig = {
            root: root, frame: frame, solids: solids, length: LENGTH, names: NAMES,
            pull: [0, 0, 0, 0, 0],                 // where each finger is right now, 0 open .. 1 fully pulled
            articulated: !!parts.articulated
        };

        // ---- fallback: unknown part layout -> static model, no joints ----
        if (!parts.articulated) {
            parts.all.forEach(function (g) { frame.add(solid(g)); });
            rig.setPull = rig.setExplode = rig.burst = rig.play = rig.setAuto = rig.setTendonScale = function () {};
            rig.update = function () {};
            rig.excursion = function () { return [0, 0]; };
            return rig;
        }

        // ---- joints -------------------------------------------------------
        // Geometry stays in hand-frame coordinates. Each joint is a group
        // sitting on its hinge; the part hangs inside it, shifted back by the
        // hinge position, so rotating the group swings the part about its pin.
        var joints = [];
        function joint(parent, origin, axis, apart) {
            var j = { parent: parent, origin: origin, node: new THREE.Group(),
                      axis: new THREE.Vector3(axis[0], axis[1], axis[2]).normalize(),
                      apart: apart || [0, 0, 0],            // where it drifts in the exploded view
                      world: new THREE.Matrix4(), rel: new THREE.Matrix4(), angle: 0 };
            var po = parent ? parent.origin : [0, 0, 0];
            j.rest = new THREE.Vector3(origin[0] - po[0], origin[1] - po[1], origin[2] - po[2]);
            j.node.position.copy(j.rest);
            (parent ? parent.node : frame).add(j.node);
            joints.push(j);
            return j;
        }
        function hang(j, mesh) { mesh.position.set(-j.origin[0], -j.origin[1], -j.origin[2]); j.node.add(mesh); return mesh; }

        var UP = new THREE.Vector3(0, 1, 0), dirTmp = new THREE.Vector3();
        // pins, the knuckle rod, string guides: plain round bars
        function bar(j, centre, dir, radius, length) {
            var m = solid(new THREE.CylinderGeometry(radius, radius, length, 14));
            dirTmp.set(dir[0], dir[1], dir[2]).normalize();
            m.quaternion.setFromUnitVectors(UP, dirTmp);
            m.position.set(centre[0] - j.origin[0], centre[1] - j.origin[1], centre[2] - j.origin[2]);
            j.node.add(m);
            return m;
        }

        var X = [1, 0, 0], Yv = [0, 1, 0];
        var palm = joint(null, [0, 0, 0], X);
        var channels = joint(palm, [0, 0, 0], X);            // stay on the palm, also in the exploded view
        hang(palm, solid(parts.palm));
        parts.channels.forEach(function (g) { hang(channels, solid(g)); });
        bar(palm, [5, MCP[0], MCP[1]], X, 4.3, 122);                                   // knuckle rod

        var fingers = [], tendonDefs = [], bandDefs = [];
        [0, 1, 2, 3].forEach(function (f) {
            var x = FINGER_X[f];
            var o0 = [x, MCP[0], MCP[1]], o1 = [x, PIP[0], PIP[1]], o2 = [x, DIP_Y[f], DIP_Z];
            var j0 = joint(palm, o0, X, [(x - 3.5) * 0.42, 34, 0]);
            var j1 = joint(j0, o1, X, [0, 28, 0]);
            var j2 = joint(j1, o2, X, [0, 28, 0]);
            hang(j0, solid(parts.fingers[f][0]));
            hang(j1, solid(parts.fingers[f][1]));
            hang(j2, solid(parts.fingers[f][2]));
            bar(j0, o1, X, 1.45, 21.5);                                                // hinge pins stay with the fork
            bar(j1, o2, X, 1.45, 17.5);

            // glued-on string guides, one per phalanx, on the palm side
            var g0 = [x, MCP[0] + 18, -5.95], g1 = [x, PIP[0] + 20, -6.85], g2 = [x, DIP_Y[f] + 13, -6.85];
            bar(j0, g0, Yv, 2.3, 9); bar(j1, g1, Yv, 2.3, 9); bar(j2, g2, Yv, 2.3, 9);

            var pts = CHANNELS[f].map(function (p) { return { j: channels, p: [p[0], p[1], CHANNEL_Z] }; });
            pts.push({ j: j0, p: add(g0, Yv, -4.5) }, { j: j0, p: add(g0, Yv, 4.5) },
                     { j: j1, p: add(g1, Yv, -4.5) }, { j: j1, p: add(g1, Yv, 4.5) },
                     { j: j2, p: add(g2, Yv, -4.5) }, { j: j2, p: add(g2, Yv, 4.5) },
                     { j: j2, p: [x, TIP_Y[f], -9.6] });
            tendonDefs.push(pts);

            // rubber bands across the two outer joints, hook to hook over the knuckle
            bandDefs.push({ a: { j: j0, p: [x, 170.3, -23.4] }, b: { j: j1, p: [x, 206.14, -23.2] }, over: j1, lift: 9.7 });
            bandDefs.push({ a: { j: j1, p: [x, HOOK_MID_Y[f], -23.3] }, b: { j: j2, p: [x, HOOK_TIP_Y[f], -23.2] }, over: j2, lift: 10.2 });
            fingers.push([j0, j1, j2]);
        });

        var T = THUMB;
        var t0 = joint(palm, T.cmc, T.axis, [T.v1[0] * 22 + 6, T.v1[1] * 22, T.v1[2] * 22]);
        var t1 = joint(t0, T.ip, T.axis, [T.v2[0] * 20, T.v2[1] * 20, T.v2[2] * 20]);
        hang(t0, solid(parts.thumb[0]));
        hang(t1, solid(parts.thumb[1]));
        bar(palm, add(T.cmc, T.axis, -0.3), T.axis, 3.4, 40);                          // thumb pivot bolt
        bar(t0, T.ip, T.axis, 1.9, 27);
        var tg0 = add(add(T.cmc, T.v1, 18), T.n1, 9.3), tg1 = add(add(T.cmc, T.v1, 44), T.n1, 8.4), tg2 = add(add(T.ip, T.v2, 18), T.n2, 5.0);
        bar(t0, tg0, T.v1, 2.3, 9); bar(t0, tg1, T.v1, 2.3, 9); bar(t1, tg2, T.v2, 2.3, 9);
        tendonDefs.push([{ j: palm, p: [27.5, -58, -4] }].concat(                      // from the wrist...
            T.tunnel.map(function (p) { return { j: palm, p: p }; }),                  // ...through the mount...
            [{ j: palm, p: T.hole }, { j: palm, p: add(T.hole, T.holeAxis, 3) },       // ...out of its hole
            { j: t0, p: add(tg0, T.v1, -4.5) }, { j: t0, p: add(tg0, T.v1, 4.5) },
            { j: t0, p: add(tg1, T.v1, -4.5) }, { j: t0, p: add(tg1, T.v1, 4.5) },
            { j: t1, p: add(tg2, T.v2, -4.5) }, { j: t1, p: add(tg2, T.v2, 4.5) },
            { j: t1, p: add(add(T.ip, T.v2, 60), T.n2, 4.6) }
        ]));
        bandDefs.push({ a: { j: palm, p: T.bandAnchor }, b: { j: t0, p: T.hookBase } });
        bandDefs.push({ a: { j: t0, p: T.hookKnuckle }, b: { j: t1, p: T.hookTip } });
        var thumb = [t0, t1];

        // ---- strings and rubber bands ------------------------------------
        function lineMaterial(color, shininess) {
            return new THREE.MeshPhongMaterial({ color: color, specular: 0x333333, shininess: shininess,
                                                 transparent: proto.transparent, opacity: proto.opacity });
        }
        var tendons = tendonDefs.map(function (defs) {
            var s = new Strands([prefixCount + defs.length], 0.75, lineMaterial(TENDON_COLOR, 40));
            frame.add(s.mesh);
            return s;
        });
        var bands = new Strands(bandDefs.map(function () { return 3; }), 0.95, lineMaterial(BAND_COLOR, 12));
        frame.add(bands.mesh);
        rig.tendons = tendons.map(function (s) { return s.mesh; });
        rig.bands = bands.mesh;

        // ---- state ---------------------------------------------------------
        var manual = [0, 0, 0, 0, 0];      // set from outside (slider, dragging)
        var gesture = [0, 0, 0, 0, 0];     // set by the built-in animations
        var explode = 0, explodeTarget = 0, burstClock = -1;
        var playing = null, auto = 'off', autoWait = 1.2, autoStep = 0, autoOrder = null;
        var lineScale = 1;
        rig.emphasis = [1, 1, 1, 1, 1];    // per-string thickness multiplier

        rig.setPull = function (finger, amount) { manual[finger] = clamp01(amount); };
        rig.setExplode = function (amount) { explodeTarget = clamp01(amount); };
        rig.burst = function () { burstClock = 0; };                    // parts jump apart, then snap together
        rig.setAuto = function (mode, delay, order) {
            auto = mode || 'off'; autoWait = delay === undefined ? 0.8 : delay;
            if (order) { autoOrder = order; autoStep = 0; }
            if (auto === 'off') playing = null;
        };
        rig.busy = function () { return !!playing; };
        rig.setTendonScale = function (s) { lineScale = s; };
        rig.explodeAmount = function () { return explode; };

        // Built-in moves. Each finger gets a rise / hold / fall pull, offset in time.
        var MOVES = {
            roll:     { delay: [0, 0.11, 0.22, 0.33, 0.46], amp: [1, 1, 1, 1, 1], rise: 0.42, hold: 0.10, fall: 0.60 },
            rollBack: { delay: [0.33, 0.22, 0.11, 0, 0.46], amp: [1, 1, 1, 1, 1], rise: 0.42, hold: 0.10, fall: 0.60 },
            grip:     { delay: [0.07, 0.05, 0.02, 0, 0.14], amp: [1, 1, 1, 1, 1], rise: 0.50, hold: 0.55, fall: 0.65 },
            pinch:    { delay: [0, 0, 0, 0, 0.05],          amp: [0, 0, 0, 0.9, 1], rise: 0.40, hold: 0.40, fall: 0.55 },
            gentle:   { delay: [0, 0.2, 0.4, 0.6, 0.85],    amp: [0.5, 0.5, 0.5, 0.5, 0.6], rise: 0.75, hold: 0.10, fall: 1.0 }
        };
        [0, 1, 2, 3, 4].forEach(function (f) {           // one finger on its own: 'finger0' .. 'finger4'
            var amp = [0, 0, 0, 0, 0]; amp[f] = 1;
            MOVES['finger' + f] = { delay: [0, 0, 0, 0, 0], amp: amp, rise: 0.45, hold: 0.25, fall: 0.6 };
        });
        var DETAIL_ORDER = ['roll', 'grip', 'rollBack', 'pinch', 'roll', 'grip'];
        rig.play = function (name) { if (MOVES[name]) playing = { move: MOVES[name], t: 0 }; };

        function stepAnimations(dt) {
            var i;
            if (playing) {
                playing.t += dt;
                var m = playing.move, busy = false;
                for (i = 0; i < 5; i++) {
                    gesture[i] = m.amp[i] * pulse(playing.t - m.delay[i], m.rise, m.hold, m.fall);
                    if (playing.t < m.delay[i] + m.rise + m.hold + m.fall) busy = true;
                }
                if (!busy) { playing = null; autoWait = auto === 'gentle' ? 2.4 + Math.random() * 1.6 : 1.3 + Math.random() * 1.1; }
            } else {
                for (i = 0; i < 5; i++) gesture[i] = 0;
                if (auto !== 'off' && explode < 0.02) {
                    autoWait -= dt;
                    if (autoWait <= 0) {
                        var order = autoOrder || DETAIL_ORDER;
                        rig.play(auto === 'gentle' ? 'gentle' : order[autoStep++ % order.length]);
                    }
                }
            }
        }

        // ---- pose ----------------------------------------------------------
        function setAngles(f, p) {
            if (f < 4) {
                var A = FLEX[f];
                fingers[f][0].angle = A[0] * ease((p - 0.12) / 0.88) * DEG;   // knuckle starts a touch late
                fingers[f][1].angle = A[1] * ease(p) * DEG;
                fingers[f][2].angle = A[2] * ease(p / 0.92) * DEG;
            } else {
                thumb[0].angle = THUMB_FLEX[0] * ease(p) * DEG;
                thumb[1].angle = THUMB_FLEX[1] * ease(p) * DEG;
            }
        }

        var shift = new THREE.Matrix4();
        function place(e) {
            for (var i = 0; i < joints.length; i++) {
                var j = joints[i];
                j.node.quaternion.setFromAxisAngle(j.axis, j.angle);
                j.node.position.set(j.rest.x + j.apart[0] * e, j.rest.y + j.apart[1] * e, j.rest.z + j.apart[2] * e);
                j.node.updateMatrix();
                if (j.parent) j.world.multiplyMatrices(j.parent.world, j.node.matrix); else j.world.copy(j.node.matrix);
                // rel: where a point given in rest hand-frame coordinates is right now
                j.rel.multiplyMatrices(j.world, shift.makeTranslation(-j.origin[0], -j.origin[1], -j.origin[2]));
            }
        }
        function put(out, o, ref) {
            var m = ref.j.rel.elements, p = ref.p;
            out[o]     = m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12];
            out[o + 1] = m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13];
            out[o + 2] = m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14];
        }

        function layTendon(f) {
            var s = tendons[f], defs = tendonDefs[f], k;
            if (prefix) prefix(f, s.points);
            for (k = 0; k < defs.length; k++) put(s.points, 3 * (prefixCount + k), defs[k]);
        }
        function tendonLength(f, from) {
            var P = tendons[f].points, n = prefixCount + tendonDefs[f].length, L = 0;
            for (var k = (from || 0) + 1; k < n; k++) {
                var dx = P[3 * k] - P[3 * k - 3], dy = P[3 * k + 1] - P[3 * k - 2], dz = P[3 * k + 2] - P[3 * k - 1];
                L += Math.sqrt(dx * dx + dy * dy + dz * dz);
            }
            return L;
        }
        var bandUp = new THREE.Vector3(), bandUp2 = new THREE.Vector3();
        function layBands() {
            var P = bands.points;
            for (var b = 0; b < bandDefs.length; b++) {
                var d = bandDefs[b], o = 9 * b;
                put(P, o, d.a); put(P, o + 6, d.b);
                if (d.over) {
                    // ride over the back of the knuckle instead of cutting through it
                    var pe = d.over.parent.world.elements, ce = d.over.world.elements;
                    bandUp.set(-pe[8], -pe[9], -pe[10]); bandUp2.set(-ce[8], -ce[9], -ce[10]);
                    bandUp.add(bandUp2).normalize();
                    P[o + 3] = ce[12] + bandUp.x * d.lift; P[o + 4] = ce[13] + bandUp.y * d.lift; P[o + 5] = ce[14] + bandUp.z * d.lift;
                } else {
                    P[o + 3] = (P[o] + P[o + 6]) / 2; P[o + 4] = (P[o + 1] + P[o + 7]) / 2; P[o + 5] = (P[o + 2] + P[o + 8]) / 2;
                }
            }
        }

        // How much string a pull of p takes up inside the hand (mm), sampled p = 0..1.
        rig.excursion = function (f, steps) {
            var out = [], keep = [], i, base = 0;
            for (i = 0; i < 5; i++) keep[i] = rig.pull[i];
            for (i = 0; i <= steps; i++) {
                setAngles(f, i / steps); place(0); layTendon(f);
                var L = tendonLength(f, prefixCount);
                if (i === 0) base = L;
                out.push(base - L);
            }
            for (i = 0; i < 5; i++) setAngles(i, keep[i]);
            return out;
        };

        rig.update = function (dt) {
            dt = Math.min(dt || 0.016, 0.05);
            var i;
            if (burstClock >= 0) { burstClock += dt; if (burstClock > 1.35) burstClock = -1; }
            var wanted = Math.max(explodeTarget, burstClock >= 0 ? 0.62 * pulse(burstClock, 0.32, 0.05, 0.9) : 0);
            explode = approach(explode, wanted, burstClock >= 0 ? 14 : 5.5, dt);
            if (explode < 0.0005 && wanted === 0) explode = 0;

            stepAnimations(dt);
            var open = 1 - ease(explode / 0.2);              // fingers straighten out as the parts separate
            for (i = 0; i < 5; i++) {
                rig.pull[i] = approach(rig.pull[i], Math.max(manual[i], gesture[i]) * open, 16, dt);
                setAngles(i, rig.pull[i]);
            }
            place(ease(explode));

            // strings and bands thin out and vanish when the hand comes apart
            var thick = (1 - ease(explode / 0.1)) * lineScale, show = thick > 0.02;
            for (i = 0; i < 5; i++) {
                tendons[i].mesh.visible = show;
                if (show) { tendons[i].radius = 0.75 * thick * rig.emphasis[i]; layTendon(i); tendons[i].commit(); }
            }
            bands.mesh.visible = show;
            if (show) { bands.radius = 0.95 * thick; layBands(); bands.commit(); }
        };

        rig.update(0);
        return rig;
    }

    // ======================================================================
    // 5. THE HAND IN THE MAIN SCENE
    //    group (the site moves / fades / scales this)
    //      > yaw (drag left-right) > pose (upright in the list, lying across
    //      the page when the project is open) > spinner (the site spins this,
    //      drag up-down rolls it) > the rig, scaled from mm to scene units
    // ======================================================================

    function createSiteModel(parts, config) {
        var rig = createRig(parts, { material: config.material });
        var pivot = new THREE.Group(); pivot.add(rig.root); pivot.scale.setScalar(config.size / LENGTH);
        var spinner = new THREE.Group(); spinner.add(pivot);
        var pose = new THREE.Group(); pose.add(spinner);
        var yaw = new THREE.Group(); yaw.add(pose);
        var group = new THREE.Group(); group.add(yaw);

        var listPose = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0.1, 'YXZ'));
        var want = new THREE.Quaternion(), euler = new THREE.Euler(0, 0, 0, 'YXZ');
        pose.quaternion.copy(listPose);

        var model = {
            rig: rig, group: group, spinner: spinner,
            open: false,
            listX: 2.35, detailScale: 1.2, detailPos: [0.15, 0.7, 0]
        };
        var clock = 0, last = 0, settle = null, dragged = false;

        // Keep it on screen whatever the window shape.
        model.layout = function (aspect, fovDeg, cameraZ) {
            var width = 2 * cameraZ * Math.tan(fovDeg * DEG / 2) * aspect;     // visible width at the model
            model.listX = Math.min(2.35, width / 2 - 0.85);
            model.detailScale = Math.max(1.25, Math.min(3.3, width * 0.46)) / config.size;
            model.detailPos[1] = aspect < 1 ? 1.05 : 0.7;      // phones: sit higher, clear of the title
        };

        model.enterDetail = function () {
            model.open = true; dragged = false;
            // finish with the palm toward the viewer after roughly one extra turn
            settle = Math.ceil((spinner.rotation.y + Math.PI) / (2 * Math.PI)) * 2 * Math.PI;
            rig.burst();
            rig.setAuto('detail', 1.5);
        };
        model.leaveDetail = function () {
            model.open = false; settle = null;
            rig.setExplode(0); rig.setPull(0, 0); rig.setPull(1, 0); rig.setPull(2, 0); rig.setPull(3, 0); rig.setPull(4, 0);
            rig.setAuto('gentle', 1.5);
        };
        model.drag = function (dx, dy) {
            dragged = true; settle = null;
            yaw.rotation.y += dx * 0.008;          // left-right turns it
            spinner.rotation.y -= dy * 0.008;      // up-down rolls it about its own length
        };

        model.update = function () {
            var now = (global.performance && performance.now) ? performance.now() : Date.now();
            var dt = last ? Math.min((now - last) / 1000, 0.05) : 0.016;
            last = now; clock += dt;

            if (model.open) {
                // lying across the page, fingers to the left, thumb on the far edge so the
                // palm and its strings are in clear view; rocking slowly
                euler.set(-0.5 + 0.16 * Math.sin(clock * 0.7), 0.3 + 0.13 * Math.sin(clock * 0.45 + 1), Math.PI / 2);
                want.setFromEuler(euler);
                if (settle !== null) {
                    spinner.rotation.y = approach(spinner.rotation.y, settle, 3.2, dt);
                    if (Math.abs(settle - spinner.rotation.y) < 0.002) { spinner.rotation.y = settle; settle = null; }
                }
            } else {
                want.copy(listPose);
                if (dragged || Math.abs(yaw.rotation.y) > 0.0005) yaw.rotation.y = approach(yaw.rotation.y, 0, 4, dt);
            }
            pose.quaternion.slerp(want, 1 - Math.exp(-4.5 * dt));
            rig.update(dt);
        };

        rig.setAuto('gentle', 2);
        return model;
    }

    global.TendonHand = {
        load: load, createRig: createRig, createSiteModel: createSiteModel,
        LENGTH: LENGTH, NAMES: NAMES, TENDON_COLOR: TENDON_COLOR,
        _facts: { FINGER_X: FINGER_X, MCP: MCP, PIP: PIP, DIP_Y: DIP_Y, DIP_Z: DIP_Z, THUMB: THUMB, CHANNELS: CHANNELS, CHANNEL_Z: CHANNEL_Z, CENTER: CENTER }
    };
})(window);
