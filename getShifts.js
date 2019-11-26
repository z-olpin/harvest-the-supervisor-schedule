const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const dfns = require('date-fns')


// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
// The file token.json stores the user's access and refresh tokens, and is
// created automatically when the authorization flow completes for the first
// time.
const TOKEN_PATH = 'token.json';

// Load client secrets from a local file.
fs.readFile('credentials.json', (err, content) => {
  if (err) return console.log('Error loading client secret file:', err);
  // Authorize a client with credentials, then call the Google Calendar API.
  authorize(JSON.parse(content), listEvents);
});

/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
const authorize = (credentials, callback) => {
  const {client_secret, client_id, redirect_uris} = credentials.installed;
  const oAuth2Client = new google.auth.OAuth2(
      client_id, client_secret, redirect_uris[0]);

  // Check if we have previously stored a token.
  fs.readFile(TOKEN_PATH, (err, token) => {
    if (err) return getAccessToken(oAuth2Client, callback);
    oAuth2Client.setCredentials(JSON.parse(token));
    callback(oAuth2Client);
  });
}

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 * @param {google.auth.OAuth2} oAuth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback for the authorized client.
 */
const getAccessToken = (oAuth2Client, callback) => {
  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });
  console.log('Authorize this app by visiting this url:', authUrl);
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.question('Enter the code from that page here: ', (code) => {
    rl.close();
    oAuth2Client.getToken(code, (err, token) => {
      if (err) return console.error('Error retrieving access token', err);
      oAuth2Client.setCredentials(token);
      // Store the token to disk for later program executions
      fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
        if (err) return console.error(err);
        console.log('Token stored to', TOKEN_PATH);
      });
      callback(oAuth2Client);
    });
  });
}

/**
 * Lists the next 10 events on the user's primary calendar.
 * @param {google.auth.OAuth2} auth An authorized OAuth2 client.
 */
const listEvents = auth => {
	const dateRange = {min: dfns.startOfMonth(new Date()), max: dfns.endOfMonth(new Date())}
  const calendar = google.calendar({version: 'v3', auth})
  
	// Get list of events with titles beginning with 'Zach'
	// and write to file shifts.json
  calendar.events.list({
    calendarId: 's51oii6034fvhudiem3j7t4q2k@group.calendar.google.com',
		timeMin: dateRange.min.toISOString(),
		timeMax: dateRange.max.toISOString(),
    singleEvents: true,
		orderBy: 'startTime'
  }, (err, res) => {
		if (err) {
			console.log(`Error getting events: ${err}`)
			return
		}
    const events = res.data.items;
    if (events.length) {
     const eventList = events.filter(event => {
				return event.summary.startsWith('Zach')
		 	}).map(event => {
         let {start: date, summary} = event
         const [year, month, day] = date.date.split('-').map(s => Number(s))
         date = new Date(year, month, day)
         let [start, end] = summary.replace(/\s/g,'').match(/\d+:?\d?\d?-(\d+:?\d?\d?|sh)/gi)[0].split('-')
         let building = summary.match(/(ah|ct|dh|rw|rs)/gi)[0]
         return {date, building, start, end}
			 })
			try {
        // Write events to shifts.json
				fs.writeFileSync('shifts.json', Buffer.from(JSON.stringify(eventList)))
			} catch (err) {
				console.log(`Error write shifts to file: ${err}`)
			}
    } else {
      console.log('No upcoming events found.');
    }
  })
}
