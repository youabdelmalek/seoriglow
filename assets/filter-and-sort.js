import { ThemeEvents, FiltersUpdatedEvent } from '@theme/events';

class FilterAndSortComponent extends HTMLElement {
  constructor() {
    super();

    this.filters = null;
    this.sorting = null;
  }

  connectedCallback() {
    this.filters = this.querySelector('filter-component');
    this.sorting = this.querySelector('sort-component');

    document.addEventListener(ThemeEvents.filtersChanged, this.#onFiltersChanged);
  }

  disconnectedCallback() {
    document.removeEventListener(ThemeEvents.filtersChanged, this.#onFiltersChanged);
  }

  #onFiltersChanged = (event) => {
    this.toggleLoading();

    const filterParams = event.detail.filter_params;
    const sortingParams = event.detail.sorting_params;
    const newUrl = this.#buildUrl(filterParams, sortingParams);

    this.#renderSection(newUrl);

    history.pushState({ urlParameters: newUrl }, '', newUrl);
  };

  #buildUrl(filterParams, sortingParams) {
    if (filterParams.length > 0) filterParams = '?' + filterParams;

    if (sortingParams.length > 0) {
      if (filterParams.length > 0) {
        sortingParams = '&' + sortingParams;
      } else {
        sortingParams = '?' + sortingParams;
      }
    }

    return `${window.location.pathname}${filterParams}${sortingParams}`;
  }

  #renderSection(requestUrl) {
    fetch(requestUrl)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        const section = this.closest('.shopify-section');

        const newCollectionGrid = html.querySelector('[data-ref="main-collection-grid"]');

        if (!newCollectionGrid) {
          throw new Error('Aucune nouvelle source de page de collection trouvée');
        }

        section.querySelector('[data-ref="main-collection-grid"]').replaceWith(newCollectionGrid);

        const newInlineFilters = html.querySelector('[data-ref="filters-inline"]');
        if (newInlineFilters) {
          this.filters.renderInlineFilters(newInlineFilters);
        }

        const newSidebarFilters = html.querySelector('[data-ref="filters-sidebar"]');
        if (newSidebarFilters) {
          this.filters.renderSidebarFilters(newSidebarFilters);
        }

        this.dispatchEvent(new FiltersUpdatedEvent());

        this.toggleLoading();
      })
      .catch((error) => {
        if (error.name === 'AbortError') {
          console.log("Fetch interrompu par l'utilisateur");
        } else {
          console.error(error);
        }
      });
  }

  toggleLoading() {
    const isLoading = this.classList.contains('filter-and-sort--loading');
    if (isLoading) {
      this.classList.remove('filter-and-sort--loading');
    } else {
      this.classList.add('filter-and-sort--loading');
    }
  }

  getCurrentFiltersParams() {
    return this.filters?.getFiltersParams() || '';
  }

  getCurrentSortingParams() {
    return this.sorting?.getSortingParams() || '';
  }
}

if (!customElements.get('filter-and-sort-component')) {
  customElements.define('filter-and-sort-component', FilterAndSortComponent);
}
