const Entities = require('html-entities').AllHtmlEntities;
const fetch    = require('node-fetch');
const sh       = require("shorthash");
const URL      = require('url');
import async = require("async");
import * as fs from 'fs';

const api_url = 'https://public-api.wordpress.com/rest/v1.1/sites/[BLOG_DOMAIN]/posts/?number=100&orderby=date&order=DESC';

let converted_posts = [];
const entities = new Entities();

function getData(): Promise<any> {
  const data_filename = __dirname+'/data.json';
  if (fs.existsSync(data_filename)) {
    console.log('Reading data from '+data_filename);
    const data = JSON.parse(fs.readFileSync(data_filename).toString());
    return Promise.resolve(data);
  } else {
    console.log('Getting data from WP API: '+api_url);
    return fetch(api_url)
      .then((res) => {
        return res.text();
      })
      .then((text) => {
        fs.writeFileSync(__dirname+'/data.json', text);
        return JSON.parse(text);
      })
      .catch((reason) => {
        console.log('ERR',reason);
      });
  }
}

function getImagesList(post): string[] {
  let images=[];
  if (post.featured_image) {
    images.push(post.featured_image);
  } else {
    images.push('');
  }
  const re = /(https:\/\/[BLOG_SLUG]\.files\.wordpress.com[^"]+)"/g;
  let matches = [];
  do {
    matches = re.exec(post.content);
    if (matches) {
      let srcSet = matches[1].split(/,?\s/);
      if (srcSet.length > 1) {
        srcSet.forEach((s) => {
          if (s.match(/^http/)) {
            images.push(s);
          }
        });
      } else {
        images.push(matches[1]);
      }
    }
  } while (matches);
  if (post.attachments) {
    for (let k in post.attachments) {
      images.push(post.attachments[k].URL);
      for (let size in post.attachments[k].thumbnails) {
        images.push(post.attachments[k].thumbnails[size]);
      }
    }
  }
  return images;
}

function getAttachmentUrls(post) {
  const attachmentreplacements: Replacement[] = [];
  const url = post.URL;
  const re = new RegExp('('+url+'[^"]+)"', 'g');
  let matches = [];
  do {
    matches = re.exec(post.content);
    if (matches) {
      const subpage = matches[1].replace(url, './');
      attachmentreplacements.push({
        find: matches[1],
        replace: '#_WP_'+Buffer.from(subpage).toString('hex')
      });
    }
  } while (matches);
  return attachmentreplacements;
}

function getRealUrl(dirtyUrl): string {
  const decoded = entities.decode(dirtyUrl);
  const parts = decoded.split('?');
  if (parts.length < 3) {
    return decoded;
  } else {
    return parts[0]+'?'+parts[1];
  }
}

interface Replacement {
  find: string,
  replace: string
}

function replacementExists(find: string, reps: Replacement[], return_rep = false): boolean | Replacement {
  const resAr=reps.filter((item) => {
    return (item.find === find);
  });
  if (return_rep) {
    return resAr[0];
  }
  return resAr.length > 0;
}

function getFileNameByUrl(url: string): string {
  const urlObj = URL.parse(url, true);
  const hash = sh.unique(url);
  const pathParts = urlObj.pathname.split('/')
  const filename = pathParts.pop();
  let prefix = '';
  if (urlObj.query.w) prefix+='w'+urlObj.query.w+'-';
  if (urlObj.query.h) prefix+='h'+urlObj.query.h+'-';
  const res = prefix+hash+'_'+filename;
  if (res.match(/undefined/)) console.log('ERRR '+res);
  return res;
}

//Change destination URL for images here
function getDestinationUrl(url: string): string {
  return '/blog_images/'+getFileNameByUrl(url);
}

function byLengthDescending(a:Replacement, b: Replacement) {
  return -1*(a.find.length - b.find.length);
}

getData()
  .then((data) => {
    const posts: any[] = data.posts;
    let allImages:string[] = [];
    posts.forEach((post) => {
      // Replace image urls with new path
      let replacements: Replacement[] = [];
      let images = getImagesList(post);
      images.forEach((item) => {
        const cleanUrl = getRealUrl(item);
        const replacement: Replacement = {
          find: item,
          replace: getDestinationUrl(cleanUrl)
        };
        if (!replacementExists(item, replacements)) {
          replacements.push(replacement);
        }
        if (allImages.indexOf(cleanUrl) === -1) {
          allImages.push(cleanUrl);
        }
        return item;
      });
      post.featured_image = replacements[0].replace;
      replacements = replacements.sort(byLengthDescending);
      replacements.forEach((rep) => {
        const parts = post.content.split(rep.find);
        post.content = parts.join(rep.replace);
      });

      if (post.attachments) {
        for (let k in post.attachments) {
          replacements.forEach((rep) => {
            post.attachments[k].URL = post.attachments[k].URL.replace(rep.find, rep.replace);
            post.attachments[k].guid = post.attachments[k].guid.replace(rep.find, rep.replace);
          });
          for (let size in post.attachments[k].thumbnails) {
            replacements.forEach((rep) => {
              post.attachments[k].thumbnails[size] = post.attachments[k].thumbnails[size].replace(rep.find, rep.replace);
            });
          }
        }
      }

      //Remove links to attachment pages
      let attachmentstoremove = getAttachmentUrls(post);
      attachmentstoremove = attachmentstoremove.sort(byLengthDescending);
      attachmentstoremove.forEach((rep) => {
        const parts = post.content.split(rep.find);
        post.content = parts.join(rep.replace);
      });
      const post_filename = __dirname+'/blog_posts/'+post.slug+'.json';
      fs.writeFileSync(post_filename, JSON.stringify(post, null, 2));
      converted_posts.push(post);
    });

    const out_filename = __dirname+'/data_converted.json';
    fs.writeFileSync(out_filename, JSON.stringify(converted_posts, null, 2));
    console.log("wrote "+out_filename);
    // console.log(allImages);
    let toGo = allImages.length;
    const downloader = async.queue((url: string, callback: () => void) => {
      const basename = getFileNameByUrl(url);
      const filename = __dirname+'/blog_images/'+basename;
      if (fs.existsSync(filename)) {
        process.stdout.write('.');
        callback();
        return;
      }
      console.log('Begin download of '+basename);
      fetch(url)
        .then((res) => {
          console.log('Downloaded '+url);
          return res.buffer()
        })
        .then((buffer) => {
          const wstream = fs.createWriteStream(filename);
          wstream.write(buffer);
          wstream.end();
          console.log('[ '+toGo+' to go ] Written to '+basename);
          toGo--;
          callback();
        })
        .catch((e) => {
          console.log(e);
          callback();
        });
    },8);
    allImages.forEach((item) => {
      downloader.push(item);
    });
  });