// lib/i18n/locales/en/matchPrediction.ts
//
// Traductions ANGLAISES du namespace `matchPrediction`.
// La SOURCE DE VERITE est le francais (`../fr/matchPrediction.ts`) : toute cle
// ajoutee la-bas doit l'etre ici (garde-fou : `locales/parity.ts`).
// Vocabulary of predictions, never of betting: no "stake", "bet" or "odds".

export default {
  title: 'Prediction',
  intro:
    'Who wins? A correct prediction earns {coins} coins for your TCG. It’s free: you don’t put any coins at stake.',
  introAnonymous:
    'Who wins? A correct prediction earns coins for your TCG. It’s free: you don’t put any coins at stake.',
  signIn: 'Sign in to predict',
  pickTeam: 'I think {team} wins',
  yourPick: 'Your prediction: {team}',
  changeHint: 'You can change your mind until the match starts.',
  locksAt: 'Predictions close: {date}',
  remove: 'Remove my prediction',
  locked: 'Predictions are closed for this match.',
  noPick: 'You didn’t predict this match.',
  resultWon: 'Correct prediction: +{coins} coins',
  resultLost: 'Missed prediction',
  resultVoid: 'No outcome: forfeit or cancelled match',
  resultPending: 'Waiting for the result',
  ineligibleParticipant:
    'You’re on one of the two teams: no predictions on your own matches.',
  ineligibleStaff: 'Staff don’t predict: they enter the scores.',
  distributionTitle: 'How people predicted',
  distributionCount_one: '{count} prediction',
  distributionCount_other: '{count} predictions',
  saved: 'Prediction saved',
  removed: 'Prediction removed',
  errorLocked: 'Too late: predictions just closed.',
  errorGeneric: 'Couldn’t save your prediction. Try again.',
  loadError: 'Couldn’t load the prediction.',
  openToAll:
    'Open to everyone, supporters included: an account is all it takes. Only the two teams playing and the staff are kept out.',
  leaderboardTitle: 'Predictors leaderboard',
  leaderboardIntro:
    'All settled predictions in this space. Forfeits and cancelled matches count neither for nor against.',
  leaderboardEmpty: 'No prediction has been settled yet.',
  leaderboardError: 'Couldn’t load the leaderboard.',
  leaderboardColRank: 'Rank',
  leaderboardColName: 'Predictor',
  leaderboardColCorrect: 'Correct',
  leaderboardColAccuracy: 'Accuracy',
  leaderboardAnonymous: 'Anonymous',
  leaderboardYou: 'You',
  leaderboardMine:
    'Your rank: {rank} — {correct} correct out of {settled} ({accuracy}%)',
  leaderboardMinePending:
    '{missing} more prediction(s) need settling before you enter the leaderboard. So far: {correct} correct out of {settled}.',
  leaderboardMineNone: 'None of your predictions have been settled yet.',
  leaderboardOptInLabel: 'Show my name on this leaderboard',
  leaderboardOptInHelp:
    'Without your consent your rank still counts: only your name is replaced by “Anonymous”. You always see your own rank.',
  leaderboardOptInSaved: 'Preference saved.',
  leaderboardOptInError: 'Preference not saved. Try again.',
  leaderboardTruncated:
    'Leaderboard computed on the first recorded predictions: beyond that it is partial.',
  panelTitle: 'Predictions',
  openTitle: 'Open for predictions',
  openEmpty: 'No upcoming match is open for predictions.',
  recentTitle: 'My predictions',
  recentEmpty: 'You haven’t predicted anything yet.',
  versus: 'vs',
  teamUnknown: 'TBD',
  seeMatch: 'See match',
  panelLoadError: 'Couldn’t load predictions.',
};
