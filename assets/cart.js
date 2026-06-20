class CartComponent extends HTMLElement {
  constructor() {
    super();
    this.checkoutButton = null;
  }

  connectedCallback() {
    this.checkoutButton = this.querySelector('[data-ref="checkout-button"]');

    this.checkoutButton.addEventListener('click', (event) => this.#handleCheckoutButtonClick(event));
  }

  disconnectedCallback() {
    this.checkoutButton.removeEventListener('click', (event) => this.#handleCheckoutButtonClick(event));
  }

  #handleCheckoutButtonClick(event) {
    event.target.classList.add('is-loading');
  }
}

if (!customElements.get('cart-component')) {
  customElements.define('cart-component', CartComponent);
}

class CartItem extends HTMLElement {
  constructor() {
    super();

    this.removeItemButton = null;
    this.quantitySelectorInput = null;
    this.cartForm = null;
  }

  connectedCallback() {
    this.removeItemButton = this.querySelector('[data-ref="remove-item"]');
    this.quantitySelectorInput = this.querySelector('[data-ref="quantity-selector-input"]');
    this.cartForm = this.closest('[data-ref="cart-form"]');

    this.removeItemButton?.addEventListener('click', (event) => this.#handleItemRemove(event));
    this.quantitySelectorInput?.addEventListener('change', (event) => this.#handleQuantityInputChange(event));
  }

  disconnectedCallback() {
    this.quantitySelectorInput?.removeEventListener('change', (event) => this.#handleQuantityInputChange(event));
    this.removeItemButton?.removeEventListener('click', (event) => this.#handleItemRemove(event));
  }

  #handleItemRemove(event) {
    event.preventDefault();

    if (this.dataset.bundleGroup) {
      this.#updateBundleGroupQuantity(0);
      return;
    }

    this.#updateLineItemQuantity(this.dataset.index, 0);
  }

  #handleQuantityInputChange(event) {
    event.preventDefault();

    if (this.dataset.bundleGroup) {
      this.#updateBundleGroupQuantity(this.quantitySelectorInput.value);
      return;
    }

    this.#updateLineItemQuantity(this.dataset.index, this.quantitySelectorInput.value);
  }

  #updateBundleGroupQuantity(quantity) {
    this.#enableLoading();

    const bundleGroup = this.dataset.bundleGroup;
    const items = Array.from(this.cartForm.querySelectorAll('[data-ref="cart-item"]'))
      .sort((a, b) => parseInt(a.dataset.index, 10) - parseInt(b.dataset.index, 10));

    const updates = items.map((item) => {
      if (item.dataset.bundleGroup === bundleGroup) {
        return parseInt(quantity, 10) || 0;
      }

      return parseInt(item.dataset.currentQuantity, 10) || 0;
    });

    const body = JSON.stringify({ updates });

    fetch(Theme.routes.cart_update_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    })
      .then((response) => response.text())
      .then((responseText) => {
        const parsedResponseText = JSON.parse(responseText);

        if (parsedResponseText.errors) {
          const message = parsedResponseText.errors.join(', ');
          document.dispatchEvent(new CustomEvent('toast:open', { detail: { type: 'error', message } }));
        }
      })
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        window.location.reload();
      });
  }

  #updateLineItemQuantity(line, quantity) {
    this.#enableLoading();

    const body = JSON.stringify({
      line,
      quantity,
    });

    fetch(Theme.routes.cart_change_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: `application/json` },
      ...{ body },
    })
      .then((response) => {
        return response.text();
      })
      .then((responsetext) => {
        const parsedResponseText = JSON.parse(responsetext);

        if (parsedResponseText.errors) {
          const message = parsedResponseText.errors.join(', ');
          document.dispatchEvent(new CustomEvent('toast:open', { detail: { type: 'error', message: message } }));
          return;
        }
      })
      .catch((e) => {
        console.error(e);
      })
      .finally(() => {
        window.location.reload();
      });
  }

  #enableLoading() {
    this.cartForm.classList.add('cart__form--loading');
  }
}

if (!customElements.get('cart-item')) {
  customElements.define('cart-item', CartItem);
}
