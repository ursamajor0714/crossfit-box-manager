  if (sessionStorage.getItem('adminToken')) {
    loadStats();
    loadPricingData();
  }
