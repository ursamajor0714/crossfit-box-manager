(function(){
  var btn = document.getElementById('btn-open-pricing');
  var modal = document.getElementById('pricing-modal');
  var closeBtn = document.getElementById('btn-close-pricing');
  if (!btn || !modal) return;
  btn.addEventListener('click', function(){ modal.classList.add('open'); });
  closeBtn.addEventListener('click', function(){ modal.classList.remove('open'); });
  modal.addEventListener('click', function(e){ if (e.target === modal) modal.classList.remove('open'); });
})();
