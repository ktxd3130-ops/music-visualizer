export class LyricManager {
  constructor() {
    this.lyrics = []; // Array of { time: number (seconds), text: string, viseme: string }
    this.startTime = 0;
    this.isRunning = false;
  }

  // Parse raw LRC string into structured array
  parseLRC(lrcText) {
    const lines = lrcText.split('\n');
    this.lyrics = [];
    
    // Regex for [mm:ss.xx]
    const timeRegex = /\[(\d{2}):(\d{2}\.\d{2,3})\]/;
    
    for (const line of lines) {
      const match = timeRegex.exec(line);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseFloat(match[2]);
        const timeInSeconds = (minutes * 60) + seconds;
        const text = line.replace(timeRegex, '').trim();
        
        // Simple heuristic for visemes based on vowels in the line
        const viseme = this.estimateViseme(text);
        
        this.lyrics.push({ time: timeInSeconds, text, viseme });
      }
    }
    
    // Sort chronologically
    this.lyrics.sort((a, b) => a.time - b.time);
  }

  // Very basic heuristic: map dominant vowel sounds to a mouth shape
  estimateViseme(text) {
    text = text.toLowerCase();
    if (text.length === 0 || text.includes('(music)')) return 'closed';
    
    // Count vowels
    const a = (text.match(/a/g) || []).length;
    const e = (text.match(/e/g) || []).length;
    const i = (text.match(/i/g) || []).length;
    const o = (text.match(/o/g) || []).length;
    const u = (text.match(/u/g) || []).length;
    
    const max = Math.max(a, e, i, o, u);
    if (max === 0) return 'closed';
    
    if (max === o || max === u) return 'narrow'; // "Ooo" / "Oh"
    if (max === a) return 'wide'; // "Aaa"
    return 'medium'; // "Eee", "Iii"
  }

  async loadFromURL(url) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      this.parseLRC(text);
      return true;
    } catch (err) {
      console.error("Failed to load LRC file:", err);
      return false;
    }
  }

  startSync() {
    this.startTime = performance.now();
    this.isRunning = true;
  }
  
  stopSync() {
    this.isRunning = false;
  }
  
  resetSync() {
    this.startTime = performance.now();
  }

  // Get current lyric data based on elapsed time
  getCurrentData() {
    if (!this.isRunning || this.lyrics.length === 0) {
      return { text: '', viseme: 'closed' };
    }
    
    const elapsedSeconds = (performance.now() - this.startTime) / 1000;
    
    // Find the current lyric playing (can look slightly ahead to trigger visemes on time)
    // Audio latency offset (~100ms)
    const compensatedSeconds = elapsedSeconds + 0.1;
    
    let currentLine = this.lyrics[0];
    for (let i = 0; i < this.lyrics.length; i++) {
      if (this.lyrics[i].time <= compensatedSeconds) {
        currentLine = this.lyrics[i];
      } else {
        break;
      }
    }
    
    // If it's been more than 3 seconds since the line started, assume silence/closed mouth
    if (elapsedSeconds - currentLine.time > 3.0) {
      return { text: '', viseme: 'closed' };
    }

    return currentLine;
  }
}
