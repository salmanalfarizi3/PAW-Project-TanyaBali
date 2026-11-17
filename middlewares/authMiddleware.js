exports.requireAuth=(req,res,next)=>{if(!req.session.user){if(req.path.startsWith('/api/'))return res.status(401).json({status:'error',message:'Silakan login terlebih dahulu.'});return res.redirect('/login?next='+encodeURIComponent(req.originalUrl));}next();};
exports.redirectIfAuth=(req,res,next)=>req.session.user?res.redirect('/'):next();
