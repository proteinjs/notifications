/** Load Dependency Source Graphs */

import '@proteinjs/util';
import '@proteinjs/reflection';
import 'nodemailer';


/** Generate Source Graph */

const sourceGraph = "{\"options\":{\"directed\":true,\"multigraph\":false,\"compound\":false},\"nodes\":[{\"v\":\"@proteinjs/email-server/DefaultPasswordResetEmailConfigFactory\",\"value\":{\"packageName\":\"@proteinjs/email-server\",\"name\":\"DefaultPasswordResetEmailConfigFactory\",\"filePath\":\"/home/runner/work/notifications/notifications/packages/email/server/src/EmailConfigs.ts\",\"qualifiedName\":\"@proteinjs/email-server/DefaultPasswordResetEmailConfigFactory\",\"properties\":[],\"methods\":[{\"name\":\"getConfig\",\"returnType\":{\"packageName\":\"@proteinjs/email-server\",\"name\":\"PasswordResetEmailConfig\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/email-server/PasswordResetEmailConfig\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[]}],\"typeParameters\":[],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}},{\"v\":\"@proteinjs/reflection/Loadable\"},{\"v\":\"@proteinjs/email-server/DefaultEmailConfigFactory\",\"value\":{\"packageName\":\"@proteinjs/email-server\",\"name\":\"DefaultEmailConfigFactory\",\"filePath\":\"/home/runner/work/notifications/notifications/packages/email/server/src/EmailSender.ts\",\"qualifiedName\":\"@proteinjs/email-server/DefaultEmailConfigFactory\",\"properties\":[],\"methods\":[{\"name\":\"getEmailConfig\",\"returnType\":{\"packageName\":\"@proteinjs/email-server\",\"name\":\"EmailConfig\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/email-server/EmailConfig\",\"typeParameters\":null,\"directParents\":null},\"isAsync\":false,\"isOptional\":false,\"isAbstract\":true,\"isStatic\":false,\"visibility\":\"public\",\"parameters\":[]}],\"typeParameters\":[],\"directParents\":[{\"packageName\":\"@proteinjs/reflection\",\"name\":\"Loadable\",\"filePath\":null,\"qualifiedName\":\"@proteinjs/reflection/Loadable\",\"properties\":[],\"methods\":[],\"typeParameters\":[],\"directParents\":[]}],\"sourceType\":3}}],\"edges\":[{\"v\":\"@proteinjs/email-server/DefaultPasswordResetEmailConfigFactory\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"},{\"v\":\"@proteinjs/email-server/DefaultEmailConfigFactory\",\"w\":\"@proteinjs/reflection/Loadable\",\"value\":\"extends interface\"}]}";


/** Generate Source Links */


const sourceLinks = {
};


/** Load Source Graph and Links */

import { SourceRepository } from '@proteinjs/reflection';
SourceRepository.merge(sourceGraph, sourceLinks);


export * from '../index';