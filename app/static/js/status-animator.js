export class StatusAnimator {
  constructor() {
    this.icons = ['accessibility', 'directions_walk', 'directions_bike', 'rowing', 'pool', 'accessible_forward', 'directions_run'];

    this.index = 0;
    this.timer = null;
  }

  start() {
    if (this.timer) return;

    const indicator = document.getElementById('status-indicator');
    indicator?.classList.remove('hidden');

    this.update();
    this.timer = setInterval(() => this.update(), 180);
  }

  update() {
    const iconEl = document.querySelector('#status-indicator .material-symbols-outlined');
    if (!iconEl) return;

    // iconEl.classList.add('icon-fade');

    setTimeout(() => {
      iconEl.textContent = this.icons[this.index];
      // iconEl.classList.remove('icon-fade');
      this.index = (this.index + 1) % this.icons.length;
    }, 150);

    this.index = (this.index + 1) % this.icons.length;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    const indicator = document.getElementById('status-indicator');
    indicator?.classList.add('hidden');
    this.index = 0;
  }
}
