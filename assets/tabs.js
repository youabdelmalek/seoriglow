class TabsContainer extends HTMLElement {
  constructor() {
    super();

    this.tabs = null;
    this.panel = null;
  }

  connectedCallback() {
    this.tabs = this.querySelectorAll('[data-ref="tab"]');
    this.panel = this.querySelector('[data-ref="tabs-panel"]');

    this.tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        this.#resetTabs();
        this.#selectTab(tab);
      });
    });

    this.#selectTab(this.tabs[0]);
  }

  #selectTab(tab) {
    const tab_content = tab.querySelector('template').content.querySelector('[data-ref="tab-content"]');

    this.panel.innerHTML = tab_content.innerHTML;
    tab.classList.add('active');
  }

  #resetTabs() {
    this.tabs.forEach((tab) => {
      tab.classList.remove('active');
    });
    this.panel.innerHTML = '';
  }
}

if (!customElements.get('tabs-container')) {
  customElements.define('tabs-container', TabsContainer);
}
