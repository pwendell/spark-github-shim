var titleTemplate = _.template(
  "<tr>" +
      "<th></th>" +
      "<th>Links</th>" +
      "<th>Title</th>" +
      "<th>Creator</th>" +
      "<th>Last comment</th>" +
      "<th>Reviewers</th>" +
      "<th>Updated</th>" +
  "</tr>");

var rowTemplate = _.template(
  "<tr>" +
    "<td><%= pr.number %></td>" +
    "<td><%= links %></td>" +
    "<td><%= pr.title %></td>" +
    "<td><%= pr.userLogin %></td>" +
    "<td><%= comments.lastCommenter %></td>" +
    "<td><% for (i in comments.commenters) { %> <%= comments.commenters[i] %> <% } %></td>" +
    "<td sorttable_customkey='<%= updated_stamp %>'><%= updated_str %></td>" +
    "<td></td>" +
  "</tr>");

var outstandingCommentRequests = 0;

// Key prefixes used in local storage
var PR_SUMMARY_PREFIX = "pr_summary_"
var PR_CODE_COMMENTS_PREFIX = "pr_code_comments_"
var PR_ISSUE_COMMENTS_PREFIX = "pr_issue_comments_"
var JIRA_DETAIL_PREFIX = "jira_detail_"
var GITHUB_API_TOKEN = "github_token"


// To allow for backwards-incompatible changes in the local storage format, we have a version
// number for local storage. If the user is behind the needed version, we simply blow away
// all local storage except for the github token.
var APP_VERSION_KEY = "app_version"
var APP_VERSION_VALUE = "1"

if (!localStorage[APP_VERSION_KEY] || localStorage[APP_VERSION_KEY] != APP_VERSION_VALUE) {
  _.map(_.keys(localStorage), function(k) {
    if (k != GITHUB_API_TOKEN) {
      localStorage.removeItem(k);
    }
  });
  localStorage[APP_VERSION_KEY] = APP_VERSION_VALUE
}


$(document).ready(function() {
  // Prep tables
  _.each($("table"), function(t) { $(t).append(titleTemplate()) });

  // Clear local PR cache
  var prKeys = _.filter(_.keys(localStorage), function(k) {
    return k.indexOf(PR_SUMMARY_PREFIX) == 0
  });
  _.each(prKeys, function(k) { localStorage.removeItem(k); });

  $("#github-token-input").change(function(event) {
    localStorage[GITHUB_API_TOKEN] = $(event.target).val().replace(/ /g, "");
    fetchPRList();
  });

  if (localStorage[GITHUB_API_TOKEN]) {
    $("#github-token-input").val(localStorage[GITHUB_API_TOKEN])
    fetchPRList();
  }
});

// API calls
var doAuth = function(xhr) {
  var gitApiToken = localStorage[GITHUB_API_TOKEN];
  xhr.setRequestHeader("Authorization", "Basic " + btoa(gitApiToken + ":x-oauth-basic"));
};

var alertError = function(xhr, status, error) {
  alert("Response from github: " + status + ", " + error);
};

function fetchPrIndex(pageNum) {
  $.ajax({
    url: "https://api.github.com/repos/apache/spark/pulls?per_page=100&page=" + pageNum,
    success: function(data, status) {
      _.each(data, function(pr) {
        // Because local storage space is limited, we extract only the fields we need
        var prShort = {};
        prShort.updated_at = pr.updated_at;
        prShort.number = pr.number;
        prShort.userLogin = pr.user.login;
        prShort.title = pr.title;
        localStorage[PR_SUMMARY_PREFIX + pr.number] = JSON.stringify(prShort)

        // This initiates a request for every PR found, meaning 100+ requests will be sent out
        // in a short amount of time. Most of these will return 304 (not modified) but it's still
        // a large number of requests. A nicer way might be to only fire a request here if we don't
        // already have a stale version of the comment cache for the PR and otherwise, put the
        // PR in a queue for later servicing. Then we could pull PR's from that queue in a rate
        // limited fashion (possibly by taking the newer ones first).
        fetchCodeComments(pr.number);
        fetchIssueComments(pr.number);
      });
      render()
    },
    error: alertError,
    beforeSend: doAuth
  });
}

function fetchCodeComments(prNum) {
  fetchComments(prNum, "pulls", PR_CODE_COMMENTS_PREFIX + prNum)
}

function fetchIssueComments(prNum) {
  fetchComments(prNum, "issues", PR_ISSUE_COMMENTS_PREFIX + prNum)
}

function fetchComments(prNum, pullsOrIssues, commentsKey) {
  outstandingCommentRequests = outstandingCommentRequests + 1;
  var headers = {};
  if (localStorage[commentsKey]) {
    headers["If-None-Match"] = JSON.parse(localStorage[commentsKey]).httpETag;
  }
  $.ajax({
    url: "https://api.github.com/repos/apache/spark/" + pullsOrIssues + "/" + prNum +
      "/comments?per_page=100",
    headers: headers,
    complete: function() {
      outstandingCommentRequests = outstandingCommentRequests - 1;
    },
    success: function(data, status, xhr) {
      function maybeRender() {
        // Avoid re-rendering frequently when we have a burst of requests
        if (outstandingCommentRequests % 20 == 0) render();
      }

      // Not modified
      if (xhr.status == 304) {
        maybeRender();
        return;
      }

      // drop Jenkins comments
      data = _.filter(data, function(comment) {
        return (comment.user.login != "AmplabJenkins") && (comment.user.login != "SparkQA");
      });
      if (data.length == 0) return;   // No comments

      var commentNames = _.map(data, function(comment) {
        return comment.user.login
      });
      var distinctNames = _.intersection(commentNames, commentNames);
      var lastCommenter = _.last(data).user.login
      var lastCommentTime = _.last(data).created_at
      var httpETag = xhr.getResponseHeader("ETag");
      var commentData = {commenters: distinctNames, lastCommenter: lastCommenter,
        lastCommentTime: lastCommentTime, httpETag: httpETag};
      localStorage[commentsKey] = JSON.stringify(commentData);
      maybeRender();
    },
    error: alertError,
    beforeSend: doAuth
  });
}


// Kick off an asynchronous fetch of PR data from github.
function fetchPRList() {
  fetchPrIndex(1);
  fetchPrIndex(2);
  fetchPrIndex(3);
  fetchPrIndex(4);
};

function createRow(prJson, commentsJson) {
  var linksTemplate = _.template(
    "[<a href='<%= github_pr_url %>/<%= pr_num %>'>pr</a>]" +
    "[<a href='<%= github_pr_url %>/<%= pr_num %>/files'>files</a>]" +
    "<% if (jira_id != null) { %>" +
    "[<a href='<%= jira_url %>/<%= jira_id %>'>JIRA</a>]" +
    "<% } %>");


  var jiraRegex = prJson.title.match(/SPARK-\d+/);
  var jiraId = jiraRegex == null ? null : jiraRegex[0];

  var links = linksTemplate({
    github_pr_url: "https://github.com/apache/spark/pull",
    jira_url: "https://issues.apache.org/jira/browse",
    pr_num: prJson.number,
    jira_id: jiraId});


  return rowTemplate({
    "pr": prJson,
    "comments": commentsJson,
    updated_str: $.timeago(new Date(prJson.updated_at)),
    updated_stamp: new Date(prJson.updated_at).getTime(),
    links: links});
};

function addPRToTable(prJson, commentJson) {
  var title = prJson.title;
  var destinationTable = $("#core-table");
  if (title.search(/SQL/i) >= 0) { destinationTable = $("#sql-table"); }
  else if (title.search(/MLLIB/i) >= 0) { destinationTable = $("#mllib-table"); }
  else if (title.search(/GRAPHX/i) >= 0 || title.search(/PREGEL/i) >= 0) {
    destinationTable = $("#graphx-table");
  }
  else if (title.search(/YARN/i) >= 0) { destinationTable = $("#yarn-table") }
  else if (title.search(/MESOS/i) >= 0) { destinationTable = $("#mesos-table") }
  else if (title.search(/STREAM/i) >= 0 || title.search(/FLUME/i) >= 0 || 
      title.search(/KAFKA/i) >= 0 || title.search(/TWITTER/i) >=0 || 
      title.search(/ZEROMQ/i) >= 0) {
    destinationTable = $("#streaming-table")
  }
  else if (title.search(/PYTHON/i) >= 0 || title.search(/PYSPARK/i) >= 0) {
    destinationTable = $("#pyspark-table")
  }
  $(destinationTable).append(createRow(prJson, commentJson));
};

// Re-render the list of fetched PR's. Idempotent.
function render() {
  _.each($("table"), function(t) { $(t).empty() });
  _.each($("table"), function(t) { $(t).append(titleTemplate()) });

  var prKeys = _.filter(_.keys(localStorage), function(k) { return k.indexOf(PR_SUMMARY_PREFIX) == 0 });
  var prTuples = _.map(prKeys, function(k) { return [k, JSON.parse(localStorage[k])] });

  // Default sort based on updated date
  prTuples.sort(function (a, b) {
    if (a[1].updated_at > b[1].updated_at) { return 1 }
    if (a[1].updated_at < b[1].updated_at) { return -1 }
    return 0
  }).reverse();

  _.each(prTuples, function (tuple) {
    var pr_Json = tuple[1];
    var prNum = pr_Json.number;

    // Merge the two different comment streams
    var emptyComments = {commenters: [], lastCommenter: "",
      lastCommentTime: "2000-06-06T00:00:00Z"}

    var prComments = emptyComments
    var issueComments = emptyComments
    if (localStorage[PR_CODE_COMMENTS_PREFIX + prNum]) {
      prComments = JSON.parse(localStorage[PR_CODE_COMMENTS_PREFIX + prNum])
    }
    if (localStorage[PR_ISSUE_COMMENTS_PREFIX + prNum]) {
      issueComments = JSON.parse(localStorage[PR_ISSUE_COMMENTS_PREFIX + prNum])
    }

    var mergedComments = {}
    mergedComments.commenters = _.union(prComments.commenters, issueComments.commenters)

    if (prComments.lastCommentTime > issueComments.lastCommentTime) {
      mergedComments.lastCommenter = prComments.lastCommenter
    } else {
      mergedComments.lastCommenter = issueComments.lastCommenter
    }

    addPRToTable(pr_Json, mergedComments);
  });

  _.each($("table"), function(t) {
    sorttable.makeSortable(t);

    // Hack to make it clear the columns are sortable
    var updated = $(t).find("th").filter(function(idx, th) { return $(th).html() == "Updated"; })
    $(updated).append("<span id='sorttable_sortfwdind'>&nbsp;&#9662;</span>");
  });
};

