const { NodeVM } = require('vm2');
const path = require('path');
const Bru = require('./bru');
const BrunoRequest = require('./bruno-request');
const BrunoResponse = require('./bruno-response');

class ScriptRuntime {
  constructor() {
  }

  runRequestScript(script, request, environment, collectionPath) {
    const bru = new Bru(environment);
    const __brunoRequest = new BrunoRequest(request);

    const context = {
      bru,
      __brunoRequest
    };
    const vm = new NodeVM({
      sandbox: context,
      require: {
        context: 'sandbox',
        external: true,
        root: [collectionPath]
      }
    });

    vm.run(script, path.join(collectionPath, 'vm.js'));

    return {
      request,
      environment
    };
  }

  runResponseScript(script, response, environment, collectionPath) {
    const bru = new Bru(environment);
    const __brunoResponse = new BrunoResponse(response);

    const context = {
      bru,
      __brunoResponse
    };
    const vm = new NodeVM({
      sandbox: context,
      require: {
        context: 'sandbox',
        external: true,
        root: [collectionPath]
      }
    });

    vm.run(script, path.join(collectionPath, 'vm.js'));

    return {
      response,
      environment
    };
  }
}

module.exports = {
  ScriptRuntime
};