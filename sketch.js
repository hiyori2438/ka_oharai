// ==========================================
// 🛠 パラメータは成功時のものを一字一句変えずに維持
// ==========================================
const MAX_PARTICLES = 600;
const SPAWN_RATE = 3;
const MOTION_THRESHOLD = 70;
const PARTICLE_SIZE = 11;
const LEAVE_DISTANCE = 230;
const FOLLOW_STRENGTH = 0.001;
const VISCOSITY = 0.9;
const SWAY_FORCE = 0.8;
const SWAY_SPEED = 0.007;
const FADE_IN_SPEED = 0.04;
const FADE_OUT_SPEED = 12;
const OFF_BODY_FADE = 5;
const FLEE_SPEED = 10;

// ==========================================
let video, selfieSegmentation, maskImg, prevFrame, motionCanvas;
let particles = [];
const VIDEO_W = 640;
const VIDEO_H = 480;

function setup() {
    createCanvas(windowWidth, windowHeight);
    video = createCapture(VIDEO);
    video.size(VIDEO_W, VIDEO_H);
    video.hide();
    prevFrame = createImage(VIDEO_W, VIDEO_H);
    motionCanvas = createGraphics(VIDEO_W / 2, VIDEO_H / 2);
    maskImg = createImage(VIDEO_W, VIDEO_H);
    let ctx = maskImg.canvas.getContext('2d', { willReadFrequently: true });

    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    selfieSegmentation.setOptions({ modelSelection: 1 });
    selfieSegmentation.onResults(results => {
        maskImg.drawingContext.clearRect(0, 0, VIDEO_W, VIDEO_H);
        maskImg.drawingContext.drawImage(results.segmentationMask, 0, 0, VIDEO_W, VIDEO_H);
        maskImg.loadPixels();
    });

    const camera = new Camera(video.elt, {
        onFrame: async () => { await selfieSegmentation.send({ image: video.elt }); },
        width: VIDEO_W, height: VIDEO_H
    });
    camera.start();

    // フォント：楷書体
    textFont('Zen Kai', 'serif');
    textSize(PARTICLE_SIZE);
    textAlign(CENTER, CENTER);
}

function draw() {
    background(0);
    let displayW = width;
    let displayH = (VIDEO_H / VIDEO_W) * width;
    if (displayH < height) {
        displayH = height;
        displayW = (VIDEO_W / VIDEO_H) * height;
    }
    const offX = (width - displayW) / 2;
    const offY = (height - displayH) / 2;

    push();
    translate(width, 0); scale(-1, 1);
    image(video, offX, offY, displayW, displayH);
    pop();

    calculateMotion();

    // 補充ルール
    let activeOnes = particles.filter(p => !p.isFadingOut);
    if (activeOnes.length <= 10) {
        while (particles.length < MAX_PARTICLES) spawnMosquito();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        let p = particles[i];
        p.applyMotion(motionCanvas, displayW, displayH);
        p.update(maskImg, offX, offY, displayW, displayH);
        p.display();
        if (p.alpha <= 0) particles.splice(i, 1);
    }
}

function calculateMotion() {
    motionCanvas.clear();
    video.loadPixels();
    prevFrame.loadPixels();
    if (video.pixels.length > 0) {
        motionCanvas.loadPixels();
        for (let y = 0; y < VIDEO_H; y += 20) { 
            for (let x = 0; x < VIDEO_W; x += 20) {
                let index = (x + y * VIDEO_W) * 4;
                if (abs(video.pixels[index] - prevFrame.pixels[index]) > MOTION_THRESHOLD) {
                    motionCanvas.fill(255);
                    motionCanvas.noStroke();
                    motionCanvas.ellipse(x / 2, y / 2, 40, 40); 
                }
            }
        }
        prevFrame.copy(video, 0, 0, VIDEO_W, VIDEO_H, 0, 0, VIDEO_W, VIDEO_H);
    }
}

function spawnMosquito() {
    let x, y;
    let edge = floor(random(4));
    if (edge === 0) { x = random(width); y = -100; }
    else if (edge === 1) { x = random(width); y = height + 100; }
    else if (edge === 2) { x = -100; y = random(height); }
    else { x = width + 100; y = random(height); }
    particles.push(new Mosquito(x, y));
}

class Mosquito {
    constructor(x, y) {
        this.char = "蚊";
        this.pos = createVector(x, y);
        this.vel = createVector(0, 0);
        this.acc = createVector(0, 0);
        this.alpha = 0;
        this.maxAlpha = 255;
        this.noiseX = random(10000);
        this.noiseY = random(10000);
        this.isFadingOut = false;     
        this.hasReachedBody = false;  
        this.targetPos = createVector(width/2, height/2);
    }

    applyMotion(mCanvas, dW, dH) {
        if (this.isFadingOut) return;
        let mx = map(this.pos.x, (width - dW) / 2, (width + dW) / 2, VIDEO_W / 2, 0);
        let my = map(this.pos.y, (height - dH) / 2, (height + dH) / 2, 0, VIDEO_H / 2);
        if (mx > 0 && mx < VIDEO_W / 2 && my > 0 && my < VIDEO_H / 2) {
            if (mCanvas.get(mx, my)[0] > 200) {
                this.vel.add(p5.Vector.random2D().mult(FLEE_SPEED)); 
                this.isFadingOut = true;
            }
        }
    }

    applyForce(force) { this.acc.add(force); }

    update(mImg, offX, offY, dW, dH) {
        let nx = (noise(this.noiseX) - 0.5) * SWAY_FORCE;
        let ny = (noise(this.noiseY) - 0.5) * SWAY_FORCE;
        this.applyForce(createVector(nx, ny));
        this.noiseX += SWAY_SPEED;
        this.noiseY += SWAY_SPEED;

        if (!this.isFadingOut) {
            if (frameCount % 10 === 0) {
                for (let i = 0; i < 30; i++) {
                    let rx = floor(random(VIDEO_W));
                    let ry = floor(random(VIDEO_H));
                    if (mImg.pixels[(rx + ry * VIDEO_W) * 4] > 127) {
                        this.targetPos.set(map(VIDEO_W - rx, 0, VIDEO_W, offX, offX + dW), map(ry, 0, VIDEO_H, offY, offY + dH));
                        break;
                    }
                }
            }
            let desired = p5.Vector.sub(this.targetPos, this.pos);
            this.applyForce(desired.mult(FOLLOW_STRENGTH));

            let tx = map(this.pos.x, offX + dW, offX, 0, VIDEO_W);
            let ty = map(this.pos.y, offY, offY + dH, 0, VIDEO_H);
            let onSil = false;
            if (tx >= 0 && tx < VIDEO_W && ty >= 0 && ty < VIDEO_H) {
                if (mImg.pixels[(floor(tx) + floor(ty) * VIDEO_W) * 4] > 127) {
                    onSil = true;
                    this.hasReachedBody = true;
                }
            }

            if (this.hasReachedBody && !onSil) {
                this.alpha -= OFF_BODY_FADE;
            } else {
                this.alpha = lerp(this.alpha, this.maxAlpha, FADE_IN_SPEED);
            }
        } else { 
            this.alpha -= FADE_OUT_SPEED; 
        }

        this.vel.add(this.acc);
        this.pos.add(this.vel);
        this.vel.mult(VISCOSITY); 
        this.acc.mult(0);
    }

    display() {
        if (this.alpha > 1) {
            fill(0, this.alpha); // 黒
            noStroke();
            push();
            translate(this.pos.x, this.pos.y);
            rotate(noise(this.noiseX) * 0.4 - 0.2);
            text(this.char, 0, 0);
            pop();
        }
    }
}