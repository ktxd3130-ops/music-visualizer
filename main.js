import './style.css';
import { AudioEngine } from './src/AudioEngine.js';
import { Visualizer } from './src/Visualizer.js';
import { LyricManager } from './src/LyricManager.js';

class App {
  constructor() {
    this.audioSourceSelect = document.getElementById('audio-source');
    this.modeSelect = document.getElementById('visualizer-mode');
    this.startBtn = document.getElementById('start-btn');
    this.syncBtn = document.getElementById('sync-lrc-btn');
    this.canvas = document.getElementById('visualizer-canvas');
    this.ctx = this.canvas.getContext('2d');
    
    this.isRunning = false;
    
    this.audioEngine = new AudioEngine();
    this.lyricManager = new LyricManager();
    this.visualizer = new Visualizer(this.canvas, this.audioEngine, this.lyricManager);
    
    this.init();
  }
  
  async init() {
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    await this.populateAudioDevices();
    
    this.startBtn.addEventListener('click', () => this.toggleAudio());
    
    this.syncBtn.addEventListener('click', () => this.toggleSync());

    this.modeSelect.addEventListener('change', (e) => {
      const mode = e.target.value;
      this.visualizer.setMode(mode);
      
      // Show sync button only on face mode
      if (mode === 'face') {
        this.syncBtn.style.display = 'inline-block';
      } else {
        this.syncBtn.style.display = 'none';
        this.lyricManager.stopSync();
        this.syncBtn.classList.remove('active');
      }
    });

    // Load lyrics in background
    this.lyricManager.loadFromURL('/test.lrc');
    
    // Draw some initial placeholder graphic
    this.drawInitialState();
  }
  
  resizeCanvas() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
    this.canvas.height = container.clientHeight;
    
    if (!this.isRunning) {
      this.drawInitialState();
    }
  }
  
  async populateAudioDevices() {
    try {
      // Must request permission first to get labels
      await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      
      this.audioSourceSelect.innerHTML = '';
      
      if (audioInputDevices.length === 0) {
        this.audioSourceSelect.innerHTML = '<option value="">No devices found</option>';
        return;
      }
      
      let blackHoleFound = false;
      
      audioInputDevices.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Microphone ${this.audioSourceSelect.length + 1}`;
        this.audioSourceSelect.appendChild(option);
        
        if (option.text.toLowerCase().includes('blackhole')) {
          option.selected = true;
          blackHoleFound = true;
        }
      });
      
      if (!blackHoleFound) {
         console.warn("BlackHole virtual audio driver not found. Please ensure it is installed and system audio is routed to it.");
      }
      
    } catch (err) {
      console.error("Error fetching audio devices:", err);
      this.audioSourceSelect.innerHTML = '<option value="">Permission denied</option>';
    }
  }
  
  async toggleAudio() {
    if (!this.isRunning) {
      const deviceId = this.audioSourceSelect.value;
      const success = await this.audioEngine.initialize(deviceId);
      
      if (success) {
        this.startBtn.textContent = 'Stop Audio';
        this.startBtn.classList.add('active');
        this.isRunning = true;
        
        this.visualizer.setMode(this.modeSelect.value);
        this.visualizer.start();
        
        // Auto-start sync if in face mode and lyrics loaded
        if (this.modeSelect.value === 'face' && this.syncBtn.classList.contains('active')) {
          this.lyricManager.resetSync();
        }
      } else {
        alert("Failed to access audio device. Please check permissions.");
      }
    } else {
      this.startBtn.textContent = 'Start Audio';
      this.startBtn.classList.remove('active');
      this.isRunning = false;
      
      this.visualizer.stop();
      this.lyricManager.stopSync();
      await this.audioEngine.stop();
      this.drawInitialState();
    }
  }

  toggleSync() {
    if (this.lyricManager.isRunning) {
      this.lyricManager.stopSync();
      this.syncBtn.classList.remove('active');
    } else {
      this.lyricManager.startSync();
      this.syncBtn.classList.add('active');
    }
  }
  
  drawInitialState() {
    const { width, height } = this.canvas;
    this.ctx.clearRect(0, 0, width, height);
    
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.font = '24px Inter, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('Select audio source and click Start', width / 2, height / 2);
  }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => {
  new App();
});
