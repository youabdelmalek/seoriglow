import { FiltersChangedEvent } from '@theme/events';

class FilterComponent extends HTMLElement {
  constructor() {
    super();

    this.form = null;
  }

  connectedCallback() {
    this.form = this.querySelector('[data-ref="filters-form"]');

    this.addEventListener('change', this.#onFiltersChanged);
  }

  disconnectedCallback() {
    this.removeEventListener('change', this.#onFiltersChanged);
  }

  #onFiltersChanged = (event) => {
    event.preventDefault();

    const filterParams = this.getFiltersParams();
    const sortingParams = this.closest('filter-and-sort-component').getCurrentSortingParams();

    document.dispatchEvent(new FiltersChangedEvent(filterParams, sortingParams));
  };

  getFiltersParams() {
    const formData = new FormData(this.form);
    const newParameters = new URLSearchParams(formData);

    if (newParameters.get('filter.v.price.gte') === '') newParameters.delete('filter.v.price.gte');
    if (newParameters.get('filter.v.price.lte') === '') newParameters.delete('filter.v.price.lte');

    newParameters.delete('page');

    return newParameters.toString();
  }

  renderInlineFilters(newFiltersHtml) {
    const currentDropdowns = this.querySelectorAll('[data-ref="filter-dropdown"]');
    const newDropdowns = newFiltersHtml.querySelectorAll('[data-ref="filter-dropdown"]');

    currentDropdowns.forEach((currentDropdown, index) => {
      currentDropdown.querySelector('[data-ref="dropdown-toggle"]').innerHTML =
        newDropdowns[index].querySelector('[data-ref="dropdown-toggle"]').innerHTML;

      currentDropdown.querySelector('[data-ref="dropdown-content"]').innerHTML = newDropdowns[index].querySelector(
        '[data-ref="dropdown-content"]',
      ).innerHTML;
    });

    const currentClearAll = this.querySelector('[data-ref="clear-all"]');
    const newClearAll = newFiltersHtml.querySelector('[data-ref="clear-all"]');

    if (currentClearAll && newClearAll) {
      currentClearAll.innerHTML = newClearAll.innerHTML;
    }
  }

  renderSidebarFilters(newFiltersHtml) {
    const currentFilters = this.querySelectorAll('[data-ref="filter-raw"]');
    const newFilters = newFiltersHtml.querySelectorAll('[data-ref="filter-raw"]');

    currentFilters.forEach((currentFilter, index) => {
      currentFilter.innerHTML = newFilters[index].innerHTML;
    });
  }
}

if (!customElements.get('filter-component')) {
  customElements.define('filter-component', FilterComponent);
}
