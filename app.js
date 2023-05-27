const express = require("express");
const app = express();
app.use(express.json());

const bcrypt = require("bcrypt");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");
const jwt = require("jsonwebtoken");
const path = require("path");
const dbPath = path.join(__dirname, "/twitterClone.db");
let db = null;
const secretKey = "!@#$%^&*";

const setUpDatabaseConnection = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("server is listening on port 3000");
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
};

setUpDatabaseConnection();

//api 1
app.post("/register/", async (req, res) => {
  const { username, password, name, gender } = req.body;
  const bringUserQuery = `select * from User where username like '${username}'`;
  const dbUser = await db.get(bringUserQuery);
  if (dbUser !== undefined) {
    res.status(400);
    res.send("User already exists");
  } else if (password.length < 6) {
    res.status(400);
    res.send("Password is too short");
  } else {
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log(hashedPassword);
    const registerQuery = `
    INSERT INTO User (username, password, name, gender)
    VALUES( '${username}', '${hashedPassword}', '${name}', '${gender}');`;
    await db.run(registerQuery);
    res.send("User created successfully");
  }
});

//api 2
app.post("/login/", async (req, res) => {
  const { username, password } = req.body;
  const bringUserQuery = `select * from User where username like '${username}'`;
  const dbUser = await db.get(bringUserQuery);
  if (dbUser === undefined) {
    res.status(400);
    res.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
    if (isPasswordMatched) {
      const payload = {
        username: username,
      };
      const jwtToken = jwt.sign(payload, secretKey);
      res.json({ jwtToken });
    } else {
      res.status(400);
      res.send("Invalid password");
    }
  }
});

//middleware
const authenticationFunction = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  let jwtToken;
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    res.status(401);
    res.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, secretKey, async (error, payLoad) => {
      if (error) {
        res.status(401);
        res.send("Invalid JWT Token");
      } else {
        const { username } = payLoad;
        req.username = username;
        next();
      }
    });
  }
};

//api 3
app.get("/user/tweets/feed/", authenticationFunction, async (req, res) => {
  const username = req.username;
  const bringUserQuery = `
  select * from User where username like '${username}';`;
  const dbUser = await db.get(bringUserQuery);
  console.log(dbUser);
  const { user_id } = dbUser;
  const bringAllLatestTweets = `
  select username, tweet ,  
  date_time as dateTime from Tweet inner join User on 
  Tweet.user_id = User.user_id where Tweet.user_id in 
  (select following_user_id from Follower 
   where follower_user_id like ${user_id})
   order by date_time desc limit 4;`;
  const tweetList = await db.all(bringAllLatestTweets);
  res.json(tweetList);
});

//api 4
app.get("/user/following/", authenticationFunction, async (req, res) => {
  const username = req.username;
  const bringUserQuery = `
    select * from User where username like '${username}';`;
  const dbUser = await db.get(bringUserQuery);
  console.log(dbUser);
  const { user_id } = dbUser;
  const bringAllWhomeUserFollowing = `
    select name from User
    where user_id in (
        select following_user_id from Follower where 
        Follower.follower_user_id like '${user_id}'
    )`;
  const data = await db.all(bringAllWhomeUserFollowing);
  res.json(data);
});

//api 5
app.get("/user/followers/", authenticationFunction, async (req, res) => {
  const username = req.username;
  const bringUserQuery = `
    select * from User where username like '${username}';`;
  const dbUser = await db.get(bringUserQuery);
  console.log(dbUser);
  const { user_id } = dbUser;
  const bringAllFollowers = `
  select name from User
    where user_id in (
        select follower_user_id from Follower where 
        Follower.following_user_id like '${user_id}'
    );`;
  const data = await db.all(bringAllFollowers);
  res.json(data);
});

//api 6
app.get("/tweets/:tweetId/", authenticationFunction, async (req, res) => {
  const { tweetId } = req.params;
  const requiredTweetQuery = `select * from Tweet where tweet_id = ${tweetId};`;
  const requiredTweet = await db.get(requiredTweetQuery);
  console.log(requiredTweet);
  const { user_id } = requiredTweet;
  const username = req.username;
  const bringUserId = `
  select user_id from User where username like '${username}';`;
  let user_id_WhichRequested = await db.get(bringUserId);
  user_id_WhichRequested = user_id_WhichRequested.user_id;
  console.log(user_id_WhichRequested);
  const FollowingsListOfUser = `
    select following_user_id from Follower where 
    follower_user_id = ${user_id_WhichRequested};`;
  let followingList = await db.all(FollowingsListOfUser);
  console.log(followingList);
  let followingList2 = followingList.map((each) => each.following_user_id);
  console.log(followingList2);
  if (user_id in followingList2) {
    const QueryForTweet = `select tweet, date_time from 
    Tweet where tweet_id = ${tweetId}`;
    const QueryForReplies = `
    select count(reply_id) as replies
      from (Tweet inner join Reply on Tweet.tweet_id = Reply.tweet_id)
      as T where T.tweet_id = ${tweetId} group by T.tweet_id;`;
    const QueryForLikes = `
    select count(like_id) as likes
      from (Tweet inner join Like on Tweet.tweet_id = Like.tweet_id)
      as T where T.tweet_id = ${tweetId} group by T.tweet_id;`;
    const Tweet = await db.get(QueryForTweet);
    const Replies = await db.get(QueryForReplies);
    const Likes = await db.get(QueryForLikes);
    const data = {
      tweet: Tweet.tweet,
      likes: Likes["likes"],
      replies: Replies["replies"],
      dateTime: Tweet.date_time,
    };
    res.json(data);
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

//api 7
app.get("/tweets/:tweetId/likes/", authenticationFunction, async (req, res) => {
  const { tweetId } = req.params;
  const requiredTweetQuery = `select * from Tweet where tweet_id = ${tweetId};`;
  const requiredTweet = await db.get(requiredTweetQuery);
  console.log(requiredTweet);
  const { user_id } = requiredTweet;
  const username = req.username;
  const bringUserId = `
    select user_id from User where username like '${username}';`;
  let user_id_WhichRequested = await db.get(bringUserId);
  user_id_WhichRequested = user_id_WhichRequested.user_id;
  console.log(user_id_WhichRequested);
  const FollowingsListOfUser = `
        select following_user_id from Follower where 
        follower_user_id = ${user_id_WhichRequested};`;
  let followingList = await db.all(FollowingsListOfUser);
  console.log(followingList);
  let followingList2 = followingList.map((each) => each.following_user_id);
  console.log(followingList2);
  if (user_id in followingList2) {
    const bringLikesQuery = `
        select username from User where user_id in
        (select user_id from Like where tweet_id = ${tweetId});`;
    const allUsername = await db.all(bringLikesQuery);
    const allUsernameUpdated = allUsername.map((each) => {
      return each.username;
    });
    res.json({ likes: allUsernameUpdated });
  } else {
    res.status(401);
    res.send("Invalid Request");
  }
});

//api 8
app.get(
  "/tweets/:tweetId/replies/",
  authenticationFunction,
  async (req, res) => {
    const { tweetId } = req.params;
    const requiredTweetQuery = `select * from Tweet where tweet_id = ${tweetId};`;
    const requiredTweet = await db.get(requiredTweetQuery);
    console.log(requiredTweet);
    const { user_id } = requiredTweet;
    const username = req.username;
    const bringUserId = `
        select user_id from User where username like '${username}';`;
    let user_id_WhichRequested = await db.get(bringUserId);
    user_id_WhichRequested = user_id_WhichRequested.user_id;
    console.log(user_id_WhichRequested);
    const FollowingsListOfUser = `
            select following_user_id from Follower where 
            follower_user_id = ${user_id_WhichRequested};`;
    let followingList = await db.all(FollowingsListOfUser);
    console.log(followingList);
    let followingList2 = followingList.map((each) => each.following_user_id);
    console.log(followingList2);
    if (user_id in followingList2) {
      const bringLikesQuery = `
        select username from User where user_id in
        (select user_id from Reply where tweet_id = ${tweetId});`;
      const allUsername = await db.all(bringLikesQuery);
      const allUsernameUpdated = allUsername.map((each) => {
        return each.username;
      });
      res.json({ replies: allUsernameUpdated });
    } else {
      res.status(401);
      res.send("Invalid Request");
    }
  }
);

//api 9
app.get("/user/tweets/", authenticationFunction, async (req, res) => {
  const username = req.username;
  const bringUserQuery = `
    select user_id from User where username = '${username}';`;
  const { user_id } = await db.get(bringUserQuery);
  //   console.log(user_id);
  const bringAllTweets = `
    select tweet_id, tweet, date_time from Tweet where user_id = ${user_id};`;
  const tweetData = await db.all(bringAllTweets);
  //   console.log(tweetData);
  const bringLikesQuery = `
    select Tweet.tweet_id,Tweet.tweet, count(*) as likes from Tweet left join Like on Tweet.tweet_id
    = Like.tweet_id where Tweet.tweet_id in 
    (select tweet_id from Tweet where user_id = ${user_id}) group by Tweet.tweet;`;
  const bringRepliesQuery = `
    select tweet, count(reply_id) as replies from Tweet left join Reply on Tweet.tweet_id
    = Reply.tweet_id where Tweet.tweet_id in 
    (select tweet_id from Tweet where user_id = ${user_id}) group by Tweet.tweet;`;
  const likesData = await db.all(bringLikesQuery);
  //   console.log(likesData);
  const repliesData = await db.all(bringRepliesQuery);
  //   console.log(repliesData);
  let counter = 0;
  const dataList = tweetData.map((eachItem) => {
    let temp = {
      tweet: eachItem.tweet,
      likes: likesData[counter]["likes"],
      replies: repliesData[counter]["replies"],
      dateTime: eachItem.date_time,
    };
    counter = counter + 1;
    return temp;
  });
  res.json(dataList);
});

//api 10
app.post("/user/tweets/", authenticationFunction, async (req, res) => {
  const { tweet } = req.body;
  const username = req.username;
  const bringUserQuery = `
    select user_id from User where username = '${username}';`;
  const { user_id } = await db.get(bringUserQuery);
  const createTweetQuery = `
    INSERT INTO Tweet ( tweet, user_id)
    VALUES( '${tweet}',	${user_id} );`;
  await db.run(createTweetQuery);
  res.send("Created a Tweet");
});

//api 11
app.delete("/tweets/:tweetId/", authenticationFunction, async (req, res) => {
  const { tweetId } = req.params;
  console.log(tweetId);
  const requiredTweetQuery = `select * from Tweet where tweet_id = ${tweetId};`;
  const requiredTweet = await db.get(requiredTweetQuery);
  console.log(requiredTweet);
  const { user_id } = requiredTweet;
  console.log(user_id);
  const username = req.username;
  const bringUserId = `
        select user_id from User where username like '${username}';`;
  let user_id_WhichRequested = await db.get(bringUserId);
  user_id_WhichRequested = user_id_WhichRequested.user_id;
  console.log(user_id_WhichRequested);
  if (user_id === user_id_WhichRequested) {
    const removeTweetQuery = `
        DELETE FROM Tweet
        WHERE tweet_id = ${tweetId};`;
    await db.run(removeTweetQuery);
    res.send("Tweet Removed");
  } else {
    res.status(401);
    res.json("Invalid Request");
  }
});

module.exports = app;
