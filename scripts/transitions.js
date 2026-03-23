document.addEventListener('DOMContentLoaded', function() {
    const links = document.querySelectorAll('a[href]');
    links.forEach(link => {
        const href = link.getAttribute('href');
        if (href && href.endsWith('.html') && !link.getAttribute('target')) {
            link.addEventListener('click', function(e) {
                e.preventDefault();
                document.body.style.transition = 'opacity 0.08s ease';
                document.body.style.opacity = '0';
                setTimeout(() => {
                    window.location.href = href;
                }, 80);
            });
        }
    });
});