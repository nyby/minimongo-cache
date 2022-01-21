const timeoutAsync = ms => new Promise(resolve => {
  setTimeout(() => resolve(), ms)
})

module.exports = { timeoutAsync }
