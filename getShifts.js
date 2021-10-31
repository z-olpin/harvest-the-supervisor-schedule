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
  const calendar = google.calendar({version: 'v3', auth})
  
  // Make a best guess for AMPM values for two times ([7:00, 3:00]) given consistent schedule patterns
  const determineAmPm = arrInOut => {
    const [inMin, outMin] = arrInOut.map(t => Number(t.split(':')[1]) || 0)
    const [inHour, outHour] = arrInOut.map(t => Number(t.split(':')[0]) || NaN)
    
    // Make array of objects representing all possible unique assignments of variables (AM and PM in this case)
    const assignmentsAmPm = vars => {
      const numVars = vars.length
      // Count in binary up to possibleStates ^ numVars
      const _assignments = [...Array(Math.pow(2, numVars)).keys()]
      .map(i => (i >>> 0).toString(2).padStart(numVars, '0'))
      .map(s => s.split('').map(n => (n === '0') ? 'pm' : 'am')) 
      .map(r => Object.fromEntries(r.map((v,i) => [vars[i], v])))
      return _assignments
    }
    
    const assignments = assignmentsAmPm(['inTime', 'outTime'])
    const SHOW = 20 // 8:00pm, use average show time with no better information
    
    for (let a of assignments) {
      // Convert to 24 hour time
      a.inTime =
        (a.inTime === 'am')
          ? (inHour * 60) + inMin
          : ((inHour + 12) * 60) + inMin
      a.outTime =
        (a.outTime === 'am')
          ? (outHour * 60) + outMin || SHOW * 60
          : (outHour + 12) * 60 + outMin || SHOW * 60 // assume 8pm show time
      if (
           a.outTime - a.inTime > 120 &&
           a.outTime - a.inTime < 600 &&
           a.inTime > 360 && a.outTime < 1320
      ) {
        return [a.inTime, a.outTime].map(t => {
          return Math.floor(t / 60)
            .toString()
            .concat(
              ':',
              (t % 60)
                .toString()
                .padStart(2, '0')
             ) // reformat as HH:MM
        }
      }
    }
  }
  
  const dateRange = {min: dfns.startOfMonth(new Date()), max: dfns.endOfMonth(new Date())}
	// Get list of events with titles beginning with 'Zach'
	// and write to file shifts.json
  calendar.events.list({
    calendarId: 's51oii6034fvhudiem3j7t4q2k@group.calendar.google.com',
    timeMin: dateRange.min.toISOString(),
    timeMax: dateRange.max.toISOString(),
    singleEvents: true,
    orderBy: 'startTime'
  },
  (err, res) => {
    if (err) {
      console.log(`Error getting events: ${err}`)
      return
    }
    const events = res.data.items;
    if (events.length) {
      const eventList =
        events
          .filter(event => event.summary.startsWith('Zach'))
          .map(event => {
            let {start: date, summary} = event
            const [year, month, day] = date.date.split('-').map(s => Number(s))
            date = new Date(year, month -  1, day)
            let [start, end] = determineAmPm(summary.replace(/\s/g,'').match(/\d+:?\d?\d?-(\d+:?\d?\d?|sh)/gi)[0].split('-'))
            let building = summary.match(/(ah|ct|dh|rw|rs)/gi)[0]
            return {date, building, start, end}
	  })
      try {
        // Write events to shifts.json
        fs.writeFileSync('shifts.json', Buffer.from(JSON.stringify(eventList)))
	console.log(eventList)
      } catch (err) {
        console.log(`Error writing shifts to file: ${err}`)
      }
    } else {
      console.log('No upcoming events found.');
    }
  })
}
