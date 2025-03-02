require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var cors = require('cors');
var cron = require('node-cron');
var axios = require('axios');

var indexRouter = require('./routes/index');
var scrapeRouter = require('./routes/scrape');
var downloadRouter = require('./routes/download');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(logger('dev'));
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: false, limit: '500mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cors());

// Message endpoint
app.get('/msg', function(req, res) {
  res.json({ msg: 'Welcome to Crawl Mate' });
});

// Setup cron job to call /msg endpoint every 7 minutes
cron.schedule('*/7 * * * *', async () => {
  try {
    const response = await axios.get(`${process.env.BACKEND_URL}/msg`);
    console.log('Cron job response:', response.data);
  } catch (error) {
    console.error('Cron job error:', error.message);
  }
});

app.use('/', indexRouter);
app.use('/scrape', scrapeRouter);
app.use('/download', downloadRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;