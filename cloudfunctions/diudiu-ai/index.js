'use strict';
const tcb=require('@cloudbase/node-sdk');
const {createService}=require('./service');
const app=tcb.init({env:tcb.SYMBOL_CURRENT_ENV,timeout:50000});
const handle=createService({getIdentity:()=>app.auth().getUserInfo()});
exports.main=async event=>handle(event);
