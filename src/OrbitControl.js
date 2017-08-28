/**
 * Provide orbit control for 3D objects
 *
 * @module echarts-gl/util/OrbitControl
 * @author Yi Shen(http://github.com/pissang)
 */

// TODO Remove magic numbers on sensitivity
var Base = require('qtek/lib/core/Base');
var Vector2 = require('qtek/lib/math/Vector2');
var Vector3 = require('qtek/lib/math/Vector3');
var Quaternion = require('qtek/lib/math/Quaternion');
var GestureMgr = require('./GestureMgr');

function firstNotNull() {
    for (var i = 0, len = arguments.length; i < len; i++) {
        if (arguments[i] != null) {
            return arguments[i];
        }
    }
}

/**
 * @alias module:echarts-x/util/OrbitControl
 */
var OrbitControl = Base.extend(function () {

    return {
        renderer: null,

        animation: null,

        /**
         * @type {HTMLDomElement}
         */
        dom: null,
        /**
         * @type {qtek.math.Vector3}
         */
        _center: new Vector3(),

        /**
         * Minimum distance to the center
         * @type {number}
         * @default 0.5
         */
        minDistance: 2,

        /**
         * Maximum distance to the center
         * @type {number}
         * @default 2
         */
        maxDistance: 100,

        /**
         * Minimum alpha rotation
         */
        minAlpha: -90,

        /**
         * Maximum alpha rotation
         */
        maxAlpha: 90,

        /**
         * Minimum beta rotation
         */
        minBeta: -Infinity,
        /**
         * Maximum beta rotation
         */
        maxBeta: Infinity,

        /**
         * Start auto rotating after still for the given time
         */
        autoRotateAfterStill: 0,

        /**
         * Direction of autoRotate. cw or ccw when looking top down.
         */
        autoRotateDirection: 'cw',

        /**
         * Degree per second
         */
        autoRotateSpeed: 60,

        /**
         * Pan or rotate
         * @type {String}
         */
        _mode: 'rotate',

        /**
         * @param {number}
         */
        damping: 0.8,

        /**
         * @param {number}
         */
        rotateSensitivity: 1,

        /**
         * @param {number}
         */
        zoomSensitivity: 1,

        /**
         * @param {number}
         */
        panSensitivity: 1,


        /**
         * @type {qtek.Camera}
         */
        _camera: null,

        _needsUpdate: false,

        _rotating: false,

        // Rotation around yAxis
        _phi: 0,
        // Rotation around xAxis
        _theta: 0,

        _mouseX: 0,
        _mouseY: 0,

        _rotateVelocity: new Vector2(),

        _panVelocity: new Vector2(),

        _distance: 20,

        _zoomSpeed: 0,

        _stillTimeout: 0,

        _animators: [],

        _gestureMgr: new GestureMgr()
    };
}, function () {
    // Each OrbitControl has it's own handler
    this._mouseDownHandler = this._mouseDownHandler.bind(this);
    this._mouseWheelHandler = this._mouseWheelHandler.bind(this);
    this._mouseMoveHandler = this._mouseMoveHandler.bind(this);
    this._mouseUpHandler = this._mouseUpHandler.bind(this);
    this._pinchHandler = this._pinchHandler.bind(this);
    this._update = this._update.bind(this);
}, {
    /**
     * Initialize.
     * Mouse event binding
     */
    init: function () {
        var dom = this.dom;

        dom.addEventListener('touchstart', this._mouseDownHandler);

        dom.addEventListener('mousedown', this._mouseDownHandler);
        dom.addEventListener('mousewheel', this._mouseWheelHandler);

        this.animation.on('frame', this._update);
    },

    /**
     * Dispose.
     * Mouse event unbinding
     */
    dispose: function () {
        var dom = this.dom;

        dom.removeEventListener('touchstart', this._mouseDownHandler);
        dom.removeEventListener('touchmove', this._mouseMoveHandler);
        dom.removeEventListener('touchend', this._mouseUpHandler);

        dom.removeEventListener('mousedown', this._mouseDownHandler);
        dom.removeEventListener('mousemove', this._mouseMoveHandler);
        dom.removeEventListener('mouseup', this._mouseUpHandler);
        dom.removeEventListener('mousewheel', this._mouseWheelHandler);

        if (this.animation) {
            this.animation.off('frame', this._update);
        }
        this.stopAllAnimation();
    },

    /**
     * Get distance
     * @return {number}
     */
    getDistance: function () {
        return this._distance;
    },

    /**
     * Set distance
     * @param {number} distance
     */
    setDistance: function (distance) {
        this._distance = distance;
        this._needsUpdate = true;
    },

    /**
     * Get alpha rotation
     * Alpha angle for top-down rotation. Positive to rotate to top.
     *
     * Which means camera rotation around x axis.
     */
    getAlpha: function () {
        return this._theta / Math.PI * 180;
    },

    /**
     * Get beta rotation
     * Beta angle for left-right rotation. Positive to rotate to right.
     *
     * Which means camera rotation around y axis.
     */
    getBeta: function () {
        return -this._phi / Math.PI * 180;
    },

    /**
     * Get control center
     * @return {Array.<number>}
     */
    getCenter: function () {
        return this._center.toArray();
    },

    /**
     * Set alpha rotation angle
     * @param {number} alpha
     */
    setAlpha: function (alpha) {
        alpha = Math.max(Math.min(this.maxAlpha, alpha), this.minAlpha);

        this._theta = alpha / 180 * Math.PI;
        this._needsUpdate = true;
    },

    /**
     * Set beta rotation angle
     * @param {number} beta
     */
    setBeta: function (beta) {
        beta = Math.max(Math.min(this.maxBeta, beta), this.minBeta);

        this._phi = -beta / 180 * Math.PI;
        this._needsUpdate = true;
    },

    /**
     * Set control center
     * @param {Array.<number>} center
     */
    setCenter: function (centerArr) {
        this._center.setArray(centerArr);
    },

    /**
     * @param {qtek.Camera} camera
     */
    setCamera: function (camera) {
        this._camera = camera;
        // this._decomposeTransform();

        this._needsUpdate = true;
    },

    /**
     * @return {qtek.Camera}
     */
    getCamera: function () {
        return this._camera;
    },


    setOption: function (opts) {
        opts = opts || {};

        ['autoRotate', 'autoRotateAfterStill',
            'autoRotateDirection', 'autoRotateSpeed',
            'damping',
            'minDistance', 'maxDistance',
            'minAlpha', 'maxAlpha', 'minBeta', 'maxBeta',
            'rotateSensitivity', 'zoomSensitivity', 'panSensitivity'
        ].forEach(function (key) {
            if (opts[key] != null) {
                this[key] = opts[key];
            }
        }, this);

        if (opts.distance != null) {
            this.setDistance(opts.distance);
        }

        if (opts.alpha != null) {
            this.setAlpha(opts.alpha);
        }
        if (opts.beta != null) {
            this.setBeta(opts.beta);
        }

        if (opts.center) {
            this.setCenter(opts.center);
        }
    },

    /**
     * @param {Object} opts
     * @param {number} opts.distance
     * @param {number} opts.alpha
     * @param {number} opts.beta
     * @param {number} [opts.duration=1000]
     * @param {number} [opts.easing='linear']
     */
    animateTo: function (opts) {
        var self = this;

        var obj = {};
        var target = {};
        if (opts.distance != null) {
            obj.distance = this.getDistance();
            target.distance = opts.distance;
        }
        if (opts.alpha != null) {
            obj.alpha = this.getAlpha();
            target.alpha = opts.alpha;
        }
        if (opts.beta != null) {
            obj.beta = this.getBeta();
            target.beta = opts.beta;
        }
        if (opts.center != null) {
            obj.center = this.getCenter();
            target.center = opts.center;
        }

        return this._addAnimator(
            animation.animate(obj)
                .when(opts.duration || 1000, target)
                .during(function () {
                    if (obj.alpha != null) {
                        self.setAlpha(obj.alpha);
                    }
                    if (obj.beta != null) {
                        self.setBeta(obj.beta);
                    }
                    if (obj.distance != null) {
                        self.setDistance(obj.distance);
                    }
                    if (obj.center != null) {
                        self.setCenter(obj.center);
                    }
                    self._needsUpdate = true;
                })
        ).start(opts.easing || 'linear');
    },

    /**
     * Stop all animation
     */
    stopAllAnimation: function () {
        for (var i = 0; i < this._animators.length; i++) {
            this._animators[i].stop();
        }
        this._animators.length = 0;
    },

    _isAnimating: function () {
        return this._animators.length > 0;
    },
    /**
     * Call update each frame
     * @param  {number} deltaTime Frame time
     */
    _update: function (deltaTime) {

        if (this._rotating) {
            var radian = (this.autoRotateDirection === 'cw' ? 1 : -1)
                 * this.autoRotateSpeed / 180 * Math.PI;
            this._phi -= radian * deltaTime / 1000;
            this._needsUpdate = true;
        }
        else if (this._rotateVelocity.len() > 0) {
            this._needsUpdate = true;
        }

        if (Math.abs(this._zoomSpeed) > 0.01 || this._panVelocity.len() > 0) {
            this._needsUpdate = true;
        }

        if (!this._needsUpdate) {
            return;
        }

        // Fixed deltaTime
        this._updateDistance(Math.min(deltaTime, 50));
        this._updatePan(Math.min(deltaTime, 50));

        this._updateRotate(Math.min(deltaTime, 50));

        this._updateTransform();

        this._camera.update();

        this.trigger('update');

        this._needsUpdate = false;
    },

    _updateRotate: function (deltaTime) {
        var velocity = this._rotateVelocity;
        this._phi = velocity.y * deltaTime / 20 + this._phi;
        this._theta = velocity.x * deltaTime / 20 + this._theta;

        this.setAlpha(this.getAlpha());
        this.setBeta(this.getBeta());

        this._vectorDamping(velocity, this.damping);
    },

    _updateDistance: function (deltaTime) {
        this._setDistance(this._distance + this._zoomSpeed * deltaTime / 20);
        this._zoomSpeed *= this.damping;
    },

    _setDistance: function (distance) {
        this._distance = Math.max(Math.min(distance, this.maxDistance), this.minDistance);
    },

    _updatePan: function (deltaTime) {

        // var velocity = this._panVelocity;
        // var len = this._distance;

        // var target = this._camera;
        // var yAxis = target.worldTransform.y;
        // var xAxis = target.worldTransform.x;

        // // PENDING
        // this._center
        //     .scaleAndAdd(xAxis, -velocity.x * len / 200)
        //     .scaleAndAdd(yAxis, -velocity.y * len / 200);

        // this._vectorDamping(velocity, 0);
    },

    _updateTransform: function () {
        var camera = this._camera;

        var dir = new Vector3();
        var theta = this._theta + Math.PI / 2;
        var phi = this._phi + Math.PI / 2;
        var r = Math.sin(theta);

        dir.x = r * Math.cos(phi);
        dir.y = -Math.cos(theta);
        dir.z = r * Math.sin(phi);

        camera.position.copy(this._center).scaleAndAdd(dir, this._distance);
        camera.rotation.identity()
            // First around y, then around x
            .rotateY(-this._phi)
            .rotateX(-this._theta);
    },

    _startCountingStill: function () {
        clearTimeout(this._stillTimeout);

        var time = this.autoRotateAfterStill;
        var self = this;
        if (!isNaN(time) && time > 0) {
            this._stillTimeout = setTimeout(function () {
                self._rotating = true;
            }, time * 1000);
        }
    },

    _vectorDamping: function (v, damping) {
        var speed = v.len();
        speed = speed * damping;
        if (speed < 1e-4) {
            speed = 0;
        }
        v.normalize().scale(speed);
    },

    _decomposeTransform: function () {
        if (!this._camera) {
            return;
        }

        // FIXME euler order......
        // FIXME alpha is not certain when beta is 90 or -90
        var euler = new Vector3();
        euler.eulerFromQuat(
            this._camera.rotation.normalize(), 'ZYX'
        );

        this._theta = -euler.x;
        this._phi = -euler.y;

        this.setBeta(this.getBeta());
        this.setAlpha(this.getAlpha());

        this._setDistance(this._camera.position.dist(this._center));
    },

    _mouseDownHandler: function (e) {
        if (this._isAnimating()) {
            return;
        }
        var x = e.clientX;
        var y = e.clientY;
        // Touch
        if (e.targetTouches) {
            var touch = e.targetTouches[0];
            x = touch.clientX;
            y = touch.clientY;

            this._mode = 'rotate';

            this._processGesture(e, 'start');
        }

        var dom = this.dom;
        dom.addEventListener('touchmove', this._mouseMoveHandler);
        dom.addEventListener('touchend', this._mouseUpHandler);

        dom.addEventListener('mousemove', this._mouseMoveHandler);
        dom.addEventListener('mouseup', this._mouseUpHandler);

        if (e.button === 0) {
            this._mode = 'rotate';
        }
        else if (e.button === 1) {
            this._mode = 'pan';
        }

        // Reset rotate velocity
        this._rotateVelocity.set(0, 0);
        this._rotating = false;
        if (this.autoRotate) {
            this._startCountingStill();
        }

        this._mouseX = x;
        this._mouseY = y;
    },

    _mouseMoveHandler: function (e) {
        if (this._isAnimating()) {
            return;
        }
        var x = e.clientX;
        var y = e.clientY;

        var haveGesture;
        // Touch
        if (e.targetTouches) {
            var touch = e.targetTouches[0];
            x = touch.clientX;
            y = touch.clientY;

            haveGesture = this._processGesture(e, 'change');
        }

        if (!haveGesture) {
            if (this._mode === 'rotate') {
                this._rotateVelocity.y = (x - this._mouseX) / this.renderer.getHeight() * 2 * this.rotateSensitivity;
                this._rotateVelocity.x = (y - this._mouseY) / this.renderer.getWidth() * 2 * this.rotateSensitivity;
            }
            else if (this._mode === 'pan') {
                this._panVelocity.x = (x - this._mouseX) / this.renderer.getWidth() * this.panSensitivity * 400;
                this._panVelocity.y = (-y + this._mouseY) / this.renderer.getHeight() * this.panSensitivity * 400;
            }
        }

        this._mouseX = x;
        this._mouseY = y;

        e.preventDefault();
    },

    _mouseWheelHandler: function (e) {
        if (this._isAnimating()) {
            return;
        }
        var delta = e.wheelDelta // Webkit
                || -e.detail; // Firefox
        if (delta === 0) {
            return;
        }
        this._zoomHandler(e, delta > 0 ? -1 : 1);
    },

    _pinchHandler: function (e) {
        if (this._isAnimating()) {
            return;
        }
        this._zoomHandler(e, e.pinchScale > 1 ? -0.4 : 0.4);
    },

    _zoomHandler: function (e, delta) {

        var x = e.clientX;
        var y = e.clientY;
        var distance = Math.max(Math.min(
            this._distance - this.minDistance,
            this.maxDistance - this._distance
        ));
        this._zoomSpeed = delta * Math.max(distance / 40 * this.zoomSensitivity, 0.2);

        this._rotating = false;

        if (this.autoRotate && this._mode === 'rotate') {
            this._startCountingStill();
        }

        e.preventDefault();
    },

    _mouseUpHandler: function (event) {
        var dom = this.dom;
        dom.removeEventListener('touchmove', this._mouseMoveHandler);
        dom.removeEventListener('touchend', this._mouseUpHandler);
        dom.removeEventListener('mousemove', this._mouseMoveHandler);
        dom.removeEventListener('mouseup', this._mouseUpHandler);

        this._processGesture(event, 'end');
    },

    _addAnimator: function (animator) {
        var animators = this._animators;
        animators.push(animator);
        animator.done(function () {
            var idx = animators.indexOf(animator);
            if (idx >= 0) {
                animators.splice(idx, 1);
            }
        });
        return animator;
    },


    _processGesture: function (event, stage) {
        var gestureMgr = this._gestureMgr;

        stage === 'start' && gestureMgr.clear();

        var gestureInfo = gestureMgr.recognize(
            event,
            null,
            this.dom
        );

        stage === 'end' && gestureMgr.clear();

        // Do not do any preventDefault here. Upper application do that if necessary.
        if (gestureInfo) {
            var type = gestureInfo.type;
            event.gestureEvent = type;

            this._pinchHandler(gestureInfo.event);
        }

        return gestureInfo;
    }
});

/**
 * If auto rotate the target
 * @type {boolean}
 * @default false
 */
Object.defineProperty(OrbitControl.prototype, 'autoRotate', {
    get: function (val) {
        return this._autoRotate;
    },
    set: function (val) {
        this._autoRotate = val;
        this._rotating = val;
    }
});


module.exports = OrbitControl;