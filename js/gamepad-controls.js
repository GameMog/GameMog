(function () {
// js/gamepad-controls.js
// Gamepad controls: a 'standard' mapped pad (Xbox, PlayStation and most others) through the browser's Gamepad API.
// Ported from Slop New York by Mr.doob, MIT, commit 9c39d20.
// (Mog City: a game layer can take the pad over, attach(layer), wagmi/pad.js. The layer then polls it from its own
// frame loop (so the pad still works while the pause menu holds the city's) and reads it through its own map instead
// of the sandbox's below: no travel-mode swap on the shoulders, no camera cycle on Y, no map on Start)
const { isTypingInField } = window.NYC;
const DEAD_ZONE = 0.15;
const BUTTON_COUNT = 17;

function axis(value) {
  return Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
}

function stick(pad, offset) {
  const x = axis(pad.axes?.[offset]), y = axis(pad.axes?.[offset + 1]);
  const distance = Math.hypot(x, y);
  const strength = Math.max(0, (Math.min(distance, 1) - DEAD_ZONE) / (1 - DEAD_ZONE));
  return distance ? { x: x / distance * strength, y: y / distance * strength } : { x: 0, y: 0 };
}

function buttonValue(pad, index) {
  const button = pad.buttons?.[index];
  return Number.isFinite(button?.value) ? Math.max(0, Math.min(1, button.value)) : button?.pressed ? 1 : 0;
}

function buttons(pad) {
  return Array.from({ length: BUTTON_COUNT }, (_, i) => Boolean(pad.buttons?.[i]?.pressed) || buttonValue(pad, i) > 0.5);
}

class GamepadControls {
  constructor(controllerManager, cameraSystem, callbacks = {}) {
    this.controller = controllerManager;
    this.camera = cameraSystem;
    this.callbacks = callbacks;
    this.connected = false;
    this.enabled = true;
    this.padIndex = null;
    this.padId = null;
    this.previousButtons = [];
    this.suppressedButtons = [];
    this.syncButtons = true;
    this.revision = 0;
    this.layer = null;
    this.focused = typeof document.hasFocus !== 'function' || document.hasFocus();

    window.addEventListener('blur', () => {
      this.focused = false;
      this.reset();
    });
    window.addEventListener('focus', () => {
      this.focused = true;
      this.reset();
    });
    document.addEventListener('visibilitychange', () => this.reset());
  }

  readPad() {
    // Some browsers expose the API but reject it through Permissions Policy.
    try {
      if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
      const pads = navigator.getGamepads();
      let first = null;
      for (let i = 0; i < (pads?.length || 0); i++) {
        const pad = pads[i];
        if (!pad?.connected || pad.mapping !== 'standard') continue;
        if (pad.index === this.padIndex && pad.id === this.padId) return pad;
        if (!first) first = pad;
      }
      return first;
    } catch {
      return null;
    }
  }

  reset() {
    this.revision++;
    // (the layer lets go of whatever it holds down for the pad)
    this.layer?.reset?.();
    this.controller.clearGamepadInput();
    const pad = this.readPad();
    if (pad && pad.index === this.padIndex && pad.id === this.padId) {
      this.previousButtons = buttons(pad);
      this.suppressedButtons = this.previousButtons.slice();
      this.syncButtons = false;
    } else {
      this.syncButtons = true;
    }
  }

  setEnabled(enabled) {
    enabled = Boolean(enabled);
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.reset();
  }

  // (Mog City) layer: { read(state), reset(), idle() }; read gets { pad, edges, held, value(i), stick(offset), dt } each
  // frame the pad is there and the page has the focus, idle() each frame it hasn't
  attach(layer) {
    this.layer = layer || null;
    this.reset();
  }

  update(dt) {
    // (with a layer attached, the layer's loop polls the pad: see attach)
    if (this.layer) return;
    this.poll(dt);
  }

  poll(dt) {
    const pad = this.readPad();
    const connected = Boolean(pad);
    const changedPad = pad ? pad.index !== this.padIndex || pad.id !== this.padId : this.connected;
    if (changedPad) {
      this.controller.clearGamepadInput();
      this.padIndex = pad ? pad.index : null;
      this.padId = pad ? pad.id : null;
      this.syncButtons = true;
    }
    this.connected = connected;
    if (!pad) {
      if (changedPad) this.layer?.reset?.();
      return;
    }

    const pressed = buttons(pad);
    if (this.syncButtons) {
      // Connecting, switching pads, or resetting must not turn a held button into a fresh action.
      this.previousButtons = pressed.slice();
      this.suppressedButtons = pressed.slice();
      this.syncButtons = false;
    }
    for (let i = 0; i < BUTTON_COUNT; i++) if (!pressed[i]) this.suppressedButtons[i] = false;
    const edge = (i) => pressed[i] && !this.previousButtons[i] && !this.suppressedButtons[i];
    const held = (i) => pressed[i] && !this.suppressedButtons[i];
    // Capture edges before callbacks: changing mode or opening the map may synchronously call reset().
    const toggleMap = edge(9), closeMap = edge(1);
    const cycleMode = Number(Boolean(edge(5))) - Number(Boolean(edge(4)));
    const cycleCamera = edge(3), recenter = edge(11);
    const layer = this.layer;
    const edges = layer ? pressed.map((_, i) => edge(i)) : null;
    const heldNow = layer ? pressed.map((_, i) => held(i)) : null;
    this.previousButtons = pressed;

    const target = document.activeElement;
    const typing = isTypingInField({ target }) || target?.tagName === 'TEXTAREA' || target?.isContentEditable;
    if (!this.focused || document.hidden || (typeof document.hasFocus === 'function' && !document.hasFocus()) || typing) {
      this.suppressedButtons = pressed.slice();
      this.controller.clearGamepadInput();
      layer?.idle?.();
      return;
    }

    if (layer) {
      const value = (i) => (this.suppressedButtons[i] ? 0 : buttonValue(pad, i));
      layer.read({ pad, edges, held: heldNow, value, stick: (offset) => stick(pad, offset), dt: Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0 });
      return;
    }

    const revision = this.revision;
    if (toggleMap) {
      this.controller.clearGamepadInput();
      this.callbacks.onToggleMap?.();
      return;
    }
    if (!this.enabled) {
      this.controller.clearGamepadInput();
      for (let i = 0; i < BUTTON_COUNT; i++) if (i !== 1 && i !== 9) this.suppressedButtons[i] = pressed[i];
      if (closeMap) this.callbacks.onCloseMap?.();
      return;
    }
    if (cycleMode) this.callbacks.onCycleMode?.(cycleMode);
    if (revision !== this.revision) return;
    if (cycleCamera) this.callbacks.onCycleCamera?.(1);
    if (revision !== this.revision) return;
    if (recenter) this.camera.resetOrbit();

    const movement = stick(pad, 0), look = stick(pad, 2);
    const mode = this.controller.activeMode;
    let drive = -movement.y;
    let vertical = 0;
    if (mode === 'car' || mode === 'cyclist') {
      drive = Math.max(0, drive, buttonValue(pad, 7)) - Math.max(0, -drive, buttonValue(pad, 6));
    } else if (mode === 'helicopter') {
      vertical = buttonValue(pad, 7) - buttonValue(pad, 6);
    }
    this.controller.setGamepadInput('forward', Math.max(0, drive));
    this.controller.setGamepadInput('backward', Math.max(0, -drive));
    this.controller.setGamepadInput('left', Math.max(0, -movement.x));
    this.controller.setGamepadInput('right', Math.max(0, movement.x));
    this.controller.setGamepadInput('up', mode === 'person' ? Number(Boolean(held(0))) : Math.max(0, vertical));
    this.controller.setGamepadInput('down', Math.max(0, -vertical));
    this.controller.setGamepadInput('boost', Number(Boolean(held(2))));
    const zoom = Number(Boolean(held(13))) - Number(Boolean(held(12)));
    this.camera.applyGamepadInput(look.x, look.y, zoom, Number.isFinite(dt) ? Math.max(0, Math.min(0.1, dt)) : 0);
  }
}

Object.assign(window.NYC, { GamepadControls });
})();
