module.exports = function (router) {

  var homeRoute = router.route('/');

  homeRoute.get(function (req, res) {
    res.json({ 
      message: 'Welcome to MP3 API',
      data: {
        endpoints: {
          users: '/api/users',
          tasks: '/api/tasks'
        }
      }
    });
  });

  return router;
}
